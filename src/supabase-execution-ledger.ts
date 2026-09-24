import type { ExecutionLedger } from "./execution-ledger.js";

export interface HttpResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type HttpFetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<HttpResponseLike>;

export interface SupabaseExecutionLedgerConfig {
  url: string;
  serviceRoleKey: string;
  tenantId: string;
  agentId: string;
  idempotencyKey: string;
  attempt: number;
  completionReceiptId: string;
  fetchImpl?: HttpFetchLike;
}

function resolveFetch(config: SupabaseExecutionLedgerConfig): HttpFetchLike {
  const runtimeFetch = (globalThis as unknown as { fetch?: HttpFetchLike }).fetch;
  const fetchImpl = config.fetchImpl ?? runtimeFetch;
  if (!fetchImpl) throw new Error("SUPABASE_FETCH_UNAVAILABLE");
  return fetchImpl;
}

function validateConfig(config: SupabaseExecutionLedgerConfig): void {
  if (!config.url) throw new Error("SUPABASE_URL_REQUIRED");
  if (!config.serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY_REQUIRED");
  if (!config.tenantId || !config.agentId || !config.idempotencyKey) throw new Error("SUPABASE_EXECUTION_CONTEXT_REQUIRED");
  if (!Number.isInteger(config.attempt) || config.attempt <= 0) throw new Error("SUPABASE_EXECUTION_ATTEMPT_INVALID");
}

export class SupabaseExecutionLedger implements ExecutionLedger {
  private executionId?: string;

  constructor(private readonly config: SupabaseExecutionLedgerConfig) {
    validateConfig(config);
  }

  private async rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
    const response = await resolveFetch(this.config)(
      `${this.config.url.replace(/\/$/, "")}/rest/v1/rpc/${name}`,
      {
        method: "POST",
        headers: {
          apikey: this.config.serviceRoleKey,
          Authorization: `Bearer ${this.config.serviceRoleKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const text = await response.text();
    if (!response.ok) {
      let code = "UNKNOWN";
      try {
        const parsed = text ? JSON.parse(text) as { code?: string } : {};
        code = parsed.code ?? code;
      } catch {
        // Provider body deliberately not included in thrown error.
      }
      if (code === "23505") return { duplicate: true };
      throw new Error(`SUPABASE_RPC_FAILED:${response.status}:${code}`);
    }
    return text ? JSON.parse(text) : null;
  }

  async tryStart(taskId: string, leaseId: string): Promise<boolean> {
    const result = await this.rpc("x1_claim_execution", {
      p_task_id: taskId,
      p_tenant_id: this.config.tenantId,
      p_lease_id: leaseId,
      p_agent_id: this.config.agentId,
      p_idempotency_key: this.config.idempotencyKey,
      p_attempt: this.config.attempt,
    });
    if (result && typeof result === "object" && (result as { duplicate?: boolean }).duplicate) return false;
    if (typeof result !== "string" || !result) throw new Error("SUPABASE_EXECUTION_ID_MISSING");
    this.executionId = result;
    return true;
  }

  async complete(_taskId: string, _leaseId: string): Promise<void> {
    if (!this.executionId) throw new Error("SUPABASE_EXECUTION_NOT_STARTED");
    await this.rpc("x1_complete_execution", {
      p_execution_id: this.executionId,
      p_receipt_id: this.config.completionReceiptId,
    });
  }

  async fail(_taskId: string, _leaseId: string, error?: unknown): Promise<void> {
    if (!this.executionId) return;
    const fingerprint = error instanceof Error ? error.name : "UNKNOWN_FAILURE";
    await this.rpc("x1_fail_execution", {
      p_execution_id: this.executionId,
      p_failure_fingerprint: fingerprint,
    });
  }
}
