import { createHash } from "node:crypto";
import { runAutoBuildDryRun, type BuildAdapters, type CheckResult, type Proposal } from "./autobuild-pipeline.js";
import type { SafeCodingDispatch } from "./coding-agent-contract.js";
import type { LeasedWork } from "./types.js";

export function codingCandidateHash(proposal: Proposal): string {
  return createHash("sha256").update(JSON.stringify(proposal.changes
    .map(c => [c.path, c.content]).sort((a, b) => a[0]!.localeCompare(b[0]!)))).digest("hex");
}

export interface BoundCodingReview extends CheckResult { candidateHash: string }
export interface CodingDispatchConfig {
  enabled?: boolean;
  environment: "development" | "preview" | "production";
  tenantId: string;
  workerId: string;
  builderId: string;
  reviewerId: string;
  authorizationReceiptId?: string;
  /** Trusted transport must authenticate this reviewer; model text is not identity. */
  adapters?: Omit<BuildAdapters, "verify"> & {
    verify(packet: SafeCodingDispatch, proposal: Proposal): Promise<BoundCodingReview>;
  };
  now?: () => number;
}

/** Inject inside the existing authorized worker. No scheduler, shell or deploy route. */
export function createCodingDispatchHandler(config: CodingDispatchConfig) {
  return async (work: LeasedWork) => {
    if (config.enabled !== true || !config.authorizationReceiptId || !config.adapters) {
      throw new Error("X1_CODING_DISPATCH_DISABLED");
    }
    if (!["development", "preview"].includes(config.environment)) {
      throw new Error("X1_CODING_DISPATCH_PRODUCTION_BLOCKED");
    }
    if (!config.builderId?.trim() || !config.reviewerId?.trim()
      || config.builderId === config.reviewerId) throw new Error("X1_CODING_REVIEW_IDENTITY_REQUIRED");
    function assertLease(): void {
      const now = (config.now ?? Date.now)();
      const acquired = Date.parse(work.lease.acquiredAt);
      const expires = Date.parse(work.lease.expiresAt);
      if (!config.tenantId || !config.workerId || work.tenant_id !== config.tenantId
        || work.lease.holderAgentId !== config.workerId || work.lease.taskId !== work.task_id
        || !work.work_id || !work.lease.leaseId) throw new Error("X1_CODING_LEASE_SCOPE_MISMATCH");
      if (!Number.isFinite(now) || !Number.isFinite(acquired) || !Number.isFinite(expires)
        || acquired > now || expires <= now || expires <= acquired) {
        throw new Error("X1_CODING_LEASE_EXPIRED_OR_INVALID");
      }
    }
    assertLease();
    const adapters = config.adapters;
    const result = await runAutoBuildDryRun(work, {
      propose: async (packet, failures) => {
        assertLease();
        const proposal = await adapters.propose(packet, failures);
        assertLease();
        return proposal;
      },
      verify: async (packet, proposal) => {
        assertLease();
        const expectedHash = codingCandidateHash(proposal);
        const review = await adapters.verify(packet, proposal);
        assertLease();
        if (review.reviewerId !== config.reviewerId || review.reviewerId === config.builderId
          || review.candidateHash !== expectedHash || codingCandidateHash(proposal) !== expectedHash) {
          throw new Error("X1_CODING_INDEPENDENT_REVIEW_BINDING_REQUIRED");
        }
        return review;
      },
      // Failure evidence is still persisted when the lease expires. This callback
      // must only append evidence, never acknowledge a queue or write code.
      record: receipt => adapters.record(receipt),
    }, { maxAttempts: 1 });
    assertLease();
    if (result.outcome !== "PLAN_READY") throw new Error("X1_CODING_PROPOSAL_BLOCKED");
    return { kind: "X1_CODING_PROPOSAL_REVIEWED", dryRun: true,
      codeWritten: false, deployed: false, receipt: result };
  };
}
