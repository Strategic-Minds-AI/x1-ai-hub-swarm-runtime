import type { LeasedWork } from "./types.js";

export const READ_ONLY_CANARY_KIND = "X1_READONLY_ACK_CANARY_V1";
type PreviewPlane = "railway" | "local-ollama";

/**
 * READ_ONLY is an authorization class, not proof that a handler did the work.
 * Only a narrowly identified, non-mutating canary may return an ACK receipt.
 * Real research, enrichment, and customer tasks require their own handler.
 */
export function assertReadOnlyCanary(work: LeasedWork, expectedPlane: PreviewPlane): void {
  const p = work.payload;
  const safe =
    work.action_class === "READ_ONLY" &&
    typeof work.mission_id === "string" &&
    /^X1-READONLY-CANARY-[A-Za-z0-9-]{6,64}$/.test(work.mission_id) &&
    /^WP-X1-CANARY-[A-Za-z0-9-]{6,64}$/.test(work.work_packet_id) &&
    /^x1\.readonly\.canary\.[A-Za-z0-9_-]{6,80}$/.test(work.task_id) &&
    p !== null && typeof p === "object" && !Array.isArray(p) &&
    p.kind === READ_ONLY_CANARY_KIND &&
    p.synthetic === true &&
    p.ack_only === true &&
    p.release_mode === "preview" &&
    p.execution_target === expectedPlane &&
    p.no_customer_data === true &&
    p.no_spend === true &&
    p.customer_outbound === false &&
    p.external_mutation === false;
  if (!safe) throw new Error("READ_ONLY_HANDLER_NOT_IMPLEMENTED");
}

export function acknowledgeReadOnlyCanary(
  work: LeasedWork,
  expectedPlane: PreviewPlane,
  sourceSha: string | null = null,
) {
  assertReadOnlyCanary(work, expectedPlane);
  return Object.freeze({
    kind: READ_ONLY_CANARY_KIND,
    synthetic: true,
    acknowledged: true,
    missionId: work.mission_id,
    workPacketId: work.work_packet_id,
    taskId: work.task_id,
    sourceSha,
  });
}
