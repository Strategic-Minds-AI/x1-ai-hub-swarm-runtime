import { createHash } from "node:crypto";
import { executeAuthorizedTask } from "./execute-authorized-task.js";
import { SupabaseExecutionLedger, type SupabaseExecutionLedgerConfig } from "./supabase-execution-ledger.js";
import { ControlPlaneClient } from "./control-plane-client.js";
import { SupabaseWorkQueue } from "./work-queue-client.js";
import type { ExecutionLedger } from "./execution-ledger.js";
import type { LeasedWork } from "./types.js";

export type WorkerTickStatus = "IDLE" | "COMPLETED" | "BLOCKED" | "FAILED";

export interface WorkerTickResult<T=unknown> {
  status: WorkerTickStatus;
  workId?: string;
  code?: string;
  output?: T;
}

export interface WorkerOrchestratorConfig {
  queue: SupabaseWorkQueue;
  controlPlane: ControlPlaneClient;
  bootstrapSigningKey: string;
  serviceRoleKey?: string;
  supabaseUrl?: string;
  gatewayUrl?: string;
  internalServiceToken?: string;
  workerId: string;
  handler: (work: LeasedWork) => Promise<unknown> | unknown;
  ledgerFactory?: (work: LeasedWork) => ExecutionLedger;
}

function codeFor(error:unknown): string {
  if(!(error instanceof Error)) return "UNKNOWN_FAILURE";
  return error.message.split(":")[0] ?? "UNKNOWN_FAILURE";
}

function nonRetryableAuthorizationError(code:string): boolean {
  return [
    "CAPABILITY_BOOTSTRAP_BLOCKED",
    "AUTHORIZATION_REQUIRED",
    "AUTHORIZATION_CONTEXT_MISMATCH",
    "AUTHORIZATION_ACTION_MISMATCH",
    "AUTHORIZATION_TIME_WINDOW_INVALID",
    "AUTHORIZATION_EXPIRED",
    "AUTHORIZATION_SIGNATURE_INVALID",
    "AUTHORIZATION_SIGNATURE_ALGORITHM_INVALID",
    "AUTHORIZATION_RECEIPT_REQUIRED",
    "CONTROL_PLANE_AUTHORIZATION_FAILED",
    "CONTROL_PLANE_INTERNAL_TOKEN_REQUIRED",
    "CONTROL_PLANE_URL_REQUIRED",
    "CONTROL_PLANE_FETCH_UNAVAILABLE",
  ].includes(code);
}

export async function processNextWork<T=unknown>(
  config: WorkerOrchestratorConfig,
): Promise<WorkerTickResult<T>> {
  if(!config.bootstrapSigningKey) throw new Error("CAPABILITY_BOOTSTRAP_SIGNING_KEY_REQUIRED");
  const work=await config.queue.leaseNextWork();
  if(!work) return {status:"IDLE"};

  let authorization;
  try {
    authorization=await config.controlPlane.requestMandatoryAuthorization({
      taskId:work.task_id,
      agentId:config.workerId,
      tenantId:work.tenant_id,
      requestedAction:work.action_class,
      requiredCapabilities:work.required_capabilities,
    });
  } catch(error) {
    const code=codeFor(error);
    // Credential/auth failures are not transient worker failures. Never auto-retry them.
    const status=nonRetryableAuthorizationError(code) ? "BLOCKED" : "FAILED";
    await config.queue.finishWork(work,status,code);
    return {status,workId:work.work_id,code};
  }

  if(!authorization.allowed) {
    await config.queue.finishWork(work,"BLOCKED","CAPABILITY_BOOTSTRAP_BLOCKED");
    return {status:"BLOCKED",workId:work.work_id,code:"CAPABILITY_BOOTSTRAP_BLOCKED"};
  }

  const ledger=config.ledgerFactory?.(work) ?? new SupabaseExecutionLedger({
    url:config.supabaseUrl,
    serviceRoleKey:config.serviceRoleKey,
    gatewayUrl:config.gatewayUrl,
    internalServiceToken:config.internalServiceToken,
    tenantId:work.tenant_id,
    agentId:config.workerId,
    // One stable key per task attempt. A failed attempt must not poison the
    // next lease via x1_execution_ledger_idempotency_key_key.
    idempotencyKey:createHash("sha256").update(
      work.idempotency_key+":"+String(work.attempt)
    ).digest("hex"),
    attempt:work.attempt,
    completionReceiptId:`worker:${work.work_id}:${work.attempt}`,
  } satisfies SupabaseExecutionLedgerConfig);

  let output:T;
  try {
    output=await executeAuthorizedTask<T>({
      authorization,
      context:{taskId:work.task_id,agentId:config.workerId,tenantId:work.tenant_id,
        requestedAction:work.action_class},
      lease:work.lease,
      signingKey:config.bootstrapSigningKey,
      ledger,
      handler:()=>config.handler(work) as Promise<T> | T,
    });
  } catch(error) {
    const code=codeFor(error);
    // Unconfirmed durable receipts must be reconciled against the ledger and
    // original lease. Marking these FAILED could trigger duplicate side effects.
    if(code==="EXECUTION_CLAIM_UNCONFIRMED" ||
       code==="EXECUTION_COMPLETION_UNCONFIRMED" ||
       code==="EXECUTION_FAILURE_RECEIPT_UNCONFIRMED") {
      return {status:"FAILED",workId:work.work_id,code};
    }
    const status=code==="DUPLICATE_EXECUTION" ||
      nonRetryableAuthorizationError(code) ? "BLOCKED" : "FAILED";
    await config.queue.finishWork(work,status,code);
    return {status,workId:work.work_id,code};
  }

  // Ledger completion succeeded. A queue acknowledgement failure is NOT an
  // execution failure. Do not send a second, contradictory FAILED transition.
  try {
    await config.queue.finishWork(work,"COMPLETED");
  } catch {
    return {status:"FAILED",workId:work.work_id,code:"QUEUE_COMPLETION_UNCONFIRMED"};
  }
  return {status:"COMPLETED",workId:work.work_id,output};
}
