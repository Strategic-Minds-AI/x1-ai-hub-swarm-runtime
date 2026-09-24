import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseExecutionLedger } from "../dist/index.js";

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

function config(fetchImpl) {
  return {
    url: "https://example.supabase.co",
    serviceRoleKey: "runtime-test-key",
    tenantId: "00000000-0000-0000-0000-000000000001",
    agentId: "agent-1",
    idempotencyKey: "a".repeat(64),
    attempt: 1,
    completionReceiptId: "execution-receipt-1",
    fetchImpl,
  };
}

test("claims and completes execution through atomic RPCs", async () => {
  const calls = [];
  const ledger = new SupabaseExecutionLedger(config(async (url, init) => {
    calls.push({url, init});
    if (url.endsWith("/x1_claim_execution")) return response(JSON.stringify("11111111-1111-1111-1111-111111111111"));
    return response("");
  }));
  assert.equal(await ledger.tryStart("task-1","lease-1"), true);
  await ledger.complete("task-1","lease-1");
  assert.match(calls[0].url, /rpc\/x1_claim_execution$/);
  assert.match(calls[1].url, /rpc\/x1_complete_execution$/);
  assert.doesNotMatch(calls[0].url, /runtime-test-key/);
});

test("database uniqueness conflict becomes duplicate execution rejection", async () => {
  const ledger = new SupabaseExecutionLedger(config(async () => response(JSON.stringify({code:"23505"}), 409)));
  assert.equal(await ledger.tryStart("task-1","lease-1"), false);
});

test("failure path sends only error class fingerprint, not error message", async () => {
  const bodies = [];
  const ledger = new SupabaseExecutionLedger(config(async (url, init) => {
    bodies.push(JSON.parse(init.body));
    if (url.endsWith("/x1_claim_execution")) return response(JSON.stringify("11111111-1111-1111-1111-111111111111"));
    return response("");
  }));
  await ledger.tryStart("task-1","lease-1");
  await ledger.fail("task-1","lease-1",new TypeError("do not persist this sensitive message"));
  assert.equal(bodies[1].p_failure_fingerprint, "TypeError");
  assert.doesNotMatch(JSON.stringify(bodies[1]), /sensitive message/);
});

test("provider failure is reduced to status/code", async () => {
  const ledger = new SupabaseExecutionLedger(config(async () => response(JSON.stringify({code:"42501",message:"hidden provider detail"}),403)));
  await assert.rejects(() => ledger.tryStart("task-1","lease-1"), (error) => error.message === "SUPABASE_RPC_FAILED:403:42501");
});
