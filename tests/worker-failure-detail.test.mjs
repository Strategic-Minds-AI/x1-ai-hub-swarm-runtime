import test from "node:test";
import assert from "node:assert/strict";
import { ControlPlaneClient, processNextWork } from "../dist/index.js";

// These tests pin the failure reporting of the worker orchestrator. Both cases previously collapsed
// to a single opaque code on the queue row, which made authorization failures impossible to cluster.

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

function leasedWork() {
  return {
    work_id: "11111111-1111-1111-1111-111111111111",
    work_packet_id: "WP-FAILURE-DETAIL",
    task_id: "task-failure-detail",
    tenant_id: "00000000-0000-0000-0000-000000000001",
    requested_by: "test",
    action_class: "READ_ONLY",
    required_capabilities: [{ id: "connector:supabase", mechanism: "connector" }],
    payload: {},
    source_sha: null,
    idempotency_key: "b".repeat(64),
    approval_reference: null,
    validation_receipt_id: null,
    rollback_reference: null,
    attempt: 1,
    lease: {
      leaseId: "lease-failure-detail",
      taskId: "task-failure-detail",
      holderAgentId: "x1-swarm-preview-1",
      acquiredAt: "2026-10-21T00:00:00.000Z",
      expiresAt: "2099-10-21T00:05:00.000Z",
    },
  };
}

function harness(fetchImpl) {
  const stored = [];
  const queue = {
    leaseNextWork: async () => leasedWork(),
    finishWork: async (_work, status, code) => { stored.push({ status, code }); },
  };
  const controlPlane = new ControlPlaneClient({
    baseUrl: "https://uvdkzsbjackpjvpoxtyk.supabase.co/functions/v1/project-zero-authorize",
    internalServiceToken: "not-a-registered-service-token",
    fetchImpl,
  });
  return { stored, config: { queue, controlPlane, bootstrapSigningKey: "derived-from-internal-token", workerId: "x1-swarm-preview-1", handler: async () => ({ acknowledged: true }) } };
}

test("a control-plane authorization failure keeps its HTTP status and inner code", async () => {
  const { stored, config } = harness(async () => response(JSON.stringify({ ok: false, code: "UNAUTHORIZED" }), 401));
  const result = await processNextWork(config);
  assert.equal(result.status, "FAILED");
  assert.equal(result.code, "CONTROL_PLANE_AUTHORIZATION_FAILED");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].status, "FAILED");
  assert.equal(stored[0].code, "CONTROL_PLANE_AUTHORIZATION_FAILED:401:UNAUTHORIZED");
});

test("a blocked authorization records which capability blocked it", async () => {
  const authorization = {
    authorization_id: "auth-failure-detail",
    task_id: "task-failure-detail",
    agent_id: "x1-swarm-preview-1",
    tenant_id: "00000000-0000-0000-0000-000000000001",
    requested_action: "READ_ONLY",
    capabilities_required: ["chatgpt:tool-surface"],
    capabilities_resolved: [],
    capability_sources: {},
    policy_version: "project-zero-1.0.0",
    registry_version: "r1",
    issued_at: "2026-10-21T00:00:00.000Z",
    expires_at: "2099-10-21T00:05:00.000Z",
    allowed: false,
    blockers: [{ capabilityId: "chatgpt:tool-surface", state: "UNAUTHORIZED", closure: "RESOLVE_CAPABILITY_STATE", detail: "Capability blocked by: UNAUTHORIZED" }],
    receipt_id: "receipt-failure-detail",
  };
  const { stored, config } = harness(async () => response(JSON.stringify({ ok: false, code: "CAPABILITY_BOOTSTRAP_BLOCKED", authorization }), 403));
  const result = await processNextWork(config);
  assert.equal(result.status, "BLOCKED");
  assert.equal(stored[0].status, "BLOCKED");
  assert.equal(stored[0].code, "CAPABILITY_BOOTSTRAP_BLOCKED:chatgpt:tool-surface=UNAUTHORIZED");
});
