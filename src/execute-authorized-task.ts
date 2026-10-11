import { verifyBootstrapAuthorization } from "./authorization-verifier.js";
import type { ExecutionLedger } from "./execution-ledger.js";
import type { BootstrapAuthorization, ExecutionContext, TaskLease } from "./types.js";

export interface AuthorizedTaskInput<T> {
  authorization?: BootstrapAuthorization;
  context: ExecutionContext;
  lease: TaskLease;
  signingKey: string;
  ledger: ExecutionLedger;
  handler: () => Promise<T> | T;
  now?: Date;
}

function verifyLease(lease: TaskLease, context: ExecutionContext, now: Date): void {
  if (!lease.leaseId || !lease.taskId || !lease.holderAgentId) throw new Error("LEASE_INCOMPLETE");
  if (lease.taskId !== context.taskId || lease.holderAgentId !== context.agentId) throw new Error("LEASE_CONTEXT_MISMATCH");
  const expiresAt=Date.parse(lease.expiresAt);
  const acquiredAt=Date.parse(lease.acquiredAt);
  if(!Number.isFinite(expiresAt) || !Number.isFinite(acquiredAt) ||
     expiresAt<=acquiredAt || acquiredAt>now.getTime()+60*1000) {
    throw new Error("LEASE_TIME_WINDOW_INVALID");
  }
  if(expiresAt<=now.getTime()) throw new Error("LEASE_EXPIRED");
}

export async function executeAuthorizedTask<T>(input: AuthorizedTaskInput<T>): Promise<T> {
  const now = input.now ?? new Date();
  verifyBootstrapAuthorization(input.authorization, input.context, input.signingKey, now);
  verifyLease(input.lease, input.context, now);

  // An RPC timeout may occur *after* the database committed the claim.
  // Never mark that unknown lease as failed and trigger a second execution.
  let claimed:boolean;
  try {
    claimed=await input.ledger.tryStart(input.context.taskId, input.lease.leaseId);
  } catch {
    throw new Error("EXECUTION_CLAIM_UNCONFIRMED");
  }
  if(!claimed) throw new Error("DUPLICATE_EXECUTION");

  // Handler failure and durable receipt failure are distinct. After a handler
  // has returned, NEVER mark the execution failed just because the provider
  // did not acknowledge the completion receipt. The lease remains available
  // for an independent reconciliation rather than risking a second execution.
  let output: T;
  try {
    output = await input.handler();
  } catch (error) {
    try {
      await input.ledger.fail(input.context.taskId, input.lease.leaseId, error);
    } catch {
      throw new Error("EXECUTION_FAILURE_RECEIPT_UNCONFIRMED");
    }
    throw error;
  }

  try {
    await input.ledger.complete(input.context.taskId, input.lease.leaseId);
  } catch {
    throw new Error("EXECUTION_COMPLETION_UNCONFIRMED");
  }
  return output;
}
