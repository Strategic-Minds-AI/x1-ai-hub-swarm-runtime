import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { executeAuthorizedTask, InMemoryExecutionLedger } from "../dist/index.js";

const KEY = "test-only-signing-key";
const NOW = new Date("2026-09-24T09:00:00.000Z");
const context = { taskId: "task-1", agentId: "agent-1", tenantId: "tenant-1" };
const lease = {
  leaseId: "lease-1",
  taskId: "task-1",
  holderAgentId: "agent-1",
  acquiredAt: "2026-09-24T08:59:00.000Z",
  expiresAt: "2026-09-24T09:05:00.000Z",
};

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function authorization(overrides = {}) {
  const unsigned = {
    authorization_id: "auth-1",
    task_id: "task-1",
    agent_id: "agent-1",
    tenant_id: "tenant-1",
    requested_action: "build",
    capabilities_required: ["skill-creator"],
    capabilities_resolved: ["skill-creator"],
    capability_sources: { "skill-creator": "skills-registry" },
    policy_version: "policy-v1",
    registry_version: "registry-v1",
    issued_at: "2026-09-24T08:59:00.000Z",
    expires_at: "2026-09-24T09:05:00.000Z",
    allowed: true,
    blockers: [],
    receipt_id: "receipt-1",
    ...overrides,
  };
  return {
    ...unsigned,
    signature: {
      algorithm: "HMAC-SHA256",
      value: createHmac("sha256", KEY).update(canonicalize(unsigned)).digest("hex"),
    },
  };
}

function baseInput(overrides = {}) {
  return {
    authorization: authorization(),
    context,
    lease,
    signingKey: KEY,
    ledger: new InMemoryExecutionLedger(),
    handler: async () => "ok",
    now: NOW,
    ...overrides,
  };
}

test("TEST 7: expired authorization is rejected", async () => {
  const auth = authorization({ expires_at: "2026-09-24T08:58:00.000Z" });
  await assert.rejects(() => executeAuthorizedTask(baseInput({ authorization: auth })), /AUTHORIZATION_EXPIRED/);
});

test("TEST 8: runtime bypass without control-plane authorization is rejected", async () => {
  await assert.rejects(() => executeAuthorizedTask(baseInput({ authorization: undefined })), /AUTHORIZATION_REQUIRED/);
});

test("TEST 9: cross-tenant authorization is rejected", async () => {
  const auth = authorization({ tenant_id: "tenant-other" });
  await assert.rejects(() => executeAuthorizedTask(baseInput({ authorization: auth })), /AUTHORIZATION_CONTEXT_MISMATCH/);
});

test("TEST 10: duplicate task lease cannot execute twice", async () => {
  const ledger = new InMemoryExecutionLedger();
  const first = await executeAuthorizedTask(baseInput({ ledger }));
  assert.equal(first, "ok");
  await assert.rejects(() => executeAuthorizedTask(baseInput({ ledger })), /DUPLICATE_EXECUTION/);
});

test("tampered authorization signature is rejected", async () => {
  const auth = authorization();
  auth.capabilities_resolved = [];
  await assert.rejects(() => executeAuthorizedTask(baseInput({ authorization: auth })), /AUTHORIZATION_SIGNATURE_INVALID/);
});

test("lease holder mismatch is rejected", async () => {
  const badLease = { ...lease, holderAgentId: "agent-other" };
  await assert.rejects(() => executeAuthorizedTask(baseInput({ lease: badLease })), /LEASE_CONTEXT_MISMATCH/);
});
