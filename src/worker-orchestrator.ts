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

// The durable queue must keep the detail that explains a failure. A bare code such as
// CONTROL_PLANE_AUTHORIZATION_FAILED cannot be clustered or repaired: the HTTP status and the inner
// provider code sit after the colons of the client error and were discarded, which is why every
// authorization failure looked identical on its row.
function failureDetail(error:unknown): string {
  if(!(error instanceof Error)) return "UNKNOWN_FAILURE";
  const message=error.message.trim();
  return (message || "UNKNOWN_FAILURE").slice(0,240);
}

// A blocked authorization previously recorded one constant, so the capability that blocked it was lost.
function blockerDetail(authorization:unknown): string {
  const source=authorization as {blockers?:Array<{capabilityId?:string;state?:string}>} | null;
  const blockers=source && Array.isArray(source.blockers) ? source.blockers : [];
  if(blockers.length===0) return "UNSPECIFIED";
  return blockers
    .map((blocker)=>String((blocker && blocker.capabilityId) || "UNKNOWN") + "=" + String((blocker && blocker.state) || "UNKNOWN"))
    .join(",")
    .slice(0,200);
}

function nonRetryableAuthorizationError(code:string): boolean {
  return [
    "CAPABILITY_BOOTSTRAP_BLOCKED",
    "AUTHORIZATION_REQUIRED",
    "AUTHORIZATION_CONTEXT_MISMATCH",
    "AUTHORIZATION_EXPIRED",
    "AUTHORIZATION_SIGNATURE_INVALID",
    "AUTHORIZATION_SIGNATURE_ALGORITHM_INVALID",
    "AUTHORIZATION_RECEIPT_REQUIRED",
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
    await config.queue.finishWork(work,"FAILED",code);
    return {status:"FAILED",workId:work.work_id,code};
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
    idempotencyKey:work.idempotency_key,
    attempt:work.attempt,
    completionReceiptId:`worker:${work.work_id}:${work.attempt}`,
  } satisfies SupabaseExecutionLedgerConfig);

  try {
    const output=await executeAuthorizedTask<T>({
      authorization,
      context:{taskId:work.task_id,agentId:config.workerId,tenantId:work.tenant_id},
      lease:work.lease,
      signingKey:config.bootstrapSigningKey,
      ledger,
      handler:()=>config.handler(work) as Promise<T> | T,
    });
    await config.queue.finishWork(work,"COMPLETED");
    return {status:"COMPLETED",workId:work.work_id,output};
  } catch(error) {
    const code=codeFor(error);
    const status=nonRetryableAuthorizationError(code) ? "BLOCKED" : "FAILED";
    await config.queue.finishWork(work,status,code);
    return {status,workId:work.work_id,code};
  }
}
