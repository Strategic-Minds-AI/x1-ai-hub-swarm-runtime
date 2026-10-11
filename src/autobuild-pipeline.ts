import { normalizeCodingWorkPacket, type SafeCodingDispatch } from "./coding-agent-contract.js";
import type { LeasedWork } from "./types.js";

/**
 * The X1 autonomous engineering loop is a deterministic, fail-closed
 * **dry-run** controller. It never writes GitHub, invokes a paid model,
 * modifies secrets or controls Railway by itself.
 * Actual adapters are injected only by a separately authorized sandbox.
 */
export interface ProposedChange {
  path: string;
  content: string;
  explanation: string;
}
export interface Proposal {
  changes: ProposedChange[];
  summary: string;
}
export interface CheckResult {
  accepted: boolean;
  checks: { name: string; pass: boolean; evidence: string }[];
  reviewerId: string;
  reviewId: string;
  basedOnSourceSha: string;
}
export type CycleOutcome = "PLAN_READY" | "BLOCKED" | "REPAIR_EXHAUSTED";
export interface CycleReceipt {
  packetId: string;
  missionId: string;
  sourceSha: string;
  attempt: number;
  outcome: CycleOutcome;
  candidatePaths: string[];
  checks: CheckResult["checks"];
  reason: string;
  validationReceiptId: string | null;
  dryRun: true;
}

export interface BuildAdapters {
  /** Sandboxed provider adapter; must not call production GitHub or model by default. */
  propose(packet: SafeCodingDispatch, retryContext: string[]): Promise<Proposal>;
  /** Independent reviewer, distinct implementation identity; never self-certify. */
  verify(packet: SafeCodingDispatch, proposal: Proposal): Promise<CheckResult>;
  /** Durable persistence must be supplied by the existing authorized X1 ledger. */
  record(receipt: CycleReceipt): Promise<void>;
}

function allowed(path: string, prefixes: string[]): boolean {
  return prefixes.some(prefix => path === prefix || (prefix.endsWith("/") && path.startsWith(prefix)));
}
function checkProposal(packet: SafeCodingDispatch, proposal: Proposal): void {
  if (!proposal || !Array.isArray(proposal.changes) || proposal.changes.length < 1 || proposal.changes.length > 20) {
    throw new Error("X1_AUTOBUILD_EMPTY_OR_OVERSIZED_PROPOSAL");
  }
  const seen = new Set<string>();
  for (const change of proposal.changes) {
    if (!change || typeof change.path !== "string" || !allowed(change.path, packet.allowedPaths)
      || change.path.includes("..") || change.path.startsWith("/") || change.path.includes("\\")
      || !/^(src|docs|tests)\//.test(change.path)) {
      throw new Error("X1_AUTOBUILD_PATH_NOT_ALLOWED");
    }
    if (seen.has(change.path)) throw new Error("X1_AUTOBUILD_DUPLICATE_PATH");
    seen.add(change.path);
    if (typeof change.content !== "string" || change.content.length > 150_000 || change.content.length < 1) {
      throw new Error("X1_AUTOBUILD_CONTENT_INVALID");
    }
    if (typeof change.explanation !== "string" || change.explanation.length > 3000) {
      throw new Error("X1_AUTOBUILD_EXPLANATION_INVALID");
    }
  }
}
function ensureIndependent(packet: SafeCodingDispatch, review: CheckResult): void {
  if (!review || typeof review.accepted !== "boolean" || !review.reviewerId || !review.reviewId
    || review.reviewerId === packet.packetId
    || review.basedOnSourceSha !== packet.sourceSha
    || !Array.isArray(review.checks) || review.checks.length < 1
    || review.checks.some(c => !c || typeof c.pass !== "boolean"
      || typeof c.name !== "string" || !c.name.trim()
      || typeof c.evidence !== "string" || !c.evidence.trim())) {
    throw new Error("X1_AUTOBUILD_INDEPENDENT_EVIDENCE_REQUIRED");
  }
  if (new Set(review.checks.map(c => c.name)).size !== review.checks.length) {
    throw new Error("X1_AUTOBUILD_INDEPENDENT_EVIDENCE_REQUIRED");
  }
  for (const required of packet.validation) {
    if (!review.checks.some(c => c.name === required)) {
      throw new Error("X1_AUTOBUILD_REQUIRED_CHECK_MISSING");
    }
  }
}
export async function runAutoBuildDryRun(
  work: LeasedWork,
  adapters: BuildAdapters,
  options: { maxAttempts?: number } = {},
): Promise<CycleReceipt> {
  const packet = normalizeCodingWorkPacket(work);
  const maxAttempts = options.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new Error("X1_AUTOBUILD_ATTEMPTS_OUT_OF_RANGE");
  }
  const problems: string[] = [];
  let last: CycleReceipt | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let proposal: Proposal;
    try {
      proposal = await adapters.propose(packet, [...problems]);
      checkProposal(packet, proposal);
      const review = await adapters.verify(packet, proposal);
      ensureIndependent(packet, review);
      const passes = review.accepted && review.checks.every(c => c.pass);
      last = {
        packetId: packet.packetId, missionId: packet.missionId, sourceSha: packet.sourceSha, attempt,
        outcome: passes ? "PLAN_READY" : attempt === maxAttempts ? "REPAIR_EXHAUSTED" : "BLOCKED",
        candidatePaths: proposal.changes.map(c => c.path), checks: review.checks,
        reason: passes ? "Independently reviewed proposed changes. No source was written." : "Validation findings require repair.",
        validationReceiptId: review.reviewId, dryRun: true,
      };
      await adapters.record(last);
      if (passes) return last;
      problems.push(...review.checks.filter(c => !c.pass).map(c => c.name + ": " + c.evidence));
    } catch (error) {
      const reason = error instanceof Error ? (error.message.split(":")[0] ?? "UNKNOWN") : "UNKNOWN";
      const failureReceipt: CycleReceipt = {
        packetId: packet.packetId, missionId: packet.missionId, sourceSha: packet.sourceSha, attempt,
        outcome: attempt === maxAttempts ? "REPAIR_EXHAUSTED" : "BLOCKED",
        candidatePaths: [], checks: [], reason, validationReceiptId: null, dryRun: true,
      };
      last = failureReceipt;
      await adapters.record(failureReceipt);
      // Security / scope / missing-evidence failures should NOT trigger repeated paid prompts.
      if (/PATH_|CONTENT_|PROPOSAL|INDEPENDENT_|REQUIRED_CHECK_|RECORD|AUTH|SCOPE/.test(reason)) return failureReceipt;
      problems.push(reason);
    }
  }
  if (!last) throw new Error("X1_AUTOBUILD_NO_RECEIPT");
  return last;
}
