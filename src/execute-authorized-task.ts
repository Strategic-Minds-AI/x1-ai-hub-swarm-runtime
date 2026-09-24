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
  if (Date.parse(lease.expiresAt) <= now.getTime()) throw new Error("LEASE_EXPIRED");
}

export async function executeAuthorizedTask<T>(input: AuthorizedTaskInput<T>): Promise<T> {
  const now = input.now ?? new Date();
  verifyBootstrapAuthorization(input.authorization, input.context, input.signingKey, now);
  verifyLease(input.lease, input.context, now);

  if (!input.ledger.tryStart(input.context.taskId, input.lease.leaseId)) {
    throw new Error("DUPLICATE_EXECUTION");
  }

  try {
    const output = await input.handler();
    input.ledger.complete(input.context.taskId, input.lease.leaseId);
    return output;
  } catch (error) {
    input.ledger.fail(input.context.taskId, input.lease.leaseId);
    throw error;
  }
}
