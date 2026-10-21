import test from "node:test";
import assert from "node:assert/strict";
import { createGatewayReceiptReader, normalizeReceiptRow, RECEIPTS_RPC } from "../src/receipt-readback.ts";

function response(status, bodyText) {
  return { ok: status >= 200 && status < 300, status: status, text: async () => bodyText };
}
function reader(config, status, body) {
  const calls = [];
  const fetchImpl = async (input, init) => { calls.push({ input: input, body: init && init.body ? init.body : "" }); return response(status, body); };
  return { calls: calls, read: createGatewayReceiptReader(Object.assign({ gatewayUrl: "https://gateway.example/db", internalServiceToken: "internal-token", fetchImpl: fetchImpl }, config || {})) };
}

test("reads receipts through the gateway with the tenant and task it was asked for", async () => {
  const stub = reader({}, 200, JSON.stringify({ ok: true, data: { receipts: [{ receipt_id: "VC-1", receipt_type: "independent_validation", tenant_id: "t", source_system: "guardian-vision-cortex", source_sha: "a".repeat(40), payload: { decision: "PASS" } }] } }));
  const rows = await stub.read.readTaskReceipts({ tenant_id: "t", task_id: "task-1" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].receipt_id, "VC-1");
  assert.equal(rows[0].payload.decision, "PASS");
  const sent = JSON.parse(stub.calls[0].body);
  assert.equal(sent.op, "rpc");
  assert.equal(sent.name, RECEIPTS_RPC);
  assert.deepEqual(sent.body, { p_tenant_id: "t", p_task_id: "task-1" });
});

test("fails closed on a gateway refusal, a transport fault and an unreadable row", async () => {
  const refused = reader({}, 500, JSON.stringify({ ok: false, code: "GATEWAY_ERROR" }));
  await assert.rejects(() => refused.read.readTaskReceipts({ tenant_id: "t", task_id: "task-1" }), /PREVIEW_READBACK_FAILED/);
  const thrown = createGatewayReceiptReader({ gatewayUrl: "https://gateway.example/db", internalServiceToken: "internal-token", fetchImpl: async () => { throw new Error("ECONNRESET"); } });
  await assert.rejects(() => thrown.readTaskReceipts({ tenant_id: "t", task_id: "task-1" }), /ECONNRESET/);
  const unreadable = reader({}, 200, JSON.stringify({ ok: true, data: { receipts: [{ receipt_id: "VC-1" }] } }));
  await assert.rejects(() => unreadable.read.readTaskReceipts({ tenant_id: "t", task_id: "task-1" }), /UNREADABLE_RECEIPT_ROW/);
  const unconfigured = createGatewayReceiptReader({});
  await assert.rejects(() => unconfigured.readTaskReceipts({ tenant_id: "t", task_id: "task-1" }), /RECEIPT_TRANSPORT_NOT_CONFIGURED/);
  const incomplete = reader({}, 200, JSON.stringify({ ok: true, data: { receipts: [] } }));
  await assert.rejects(() => incomplete.read.readTaskReceipts({ tenant_id: "", task_id: "" }), /READBACK_REF_INCOMPLETE/);
});

test("normalizes a ledger row and drops one with no identifier", () => {
  const row = normalizeReceiptRow({ receipt_id: "VC-1", receipt_type: "independent_validation", tenant_id: "t", source_system: "guardian-vision-cortex", source_sha: "a".repeat(40), created_at: "2026-10-21T04:00:00.000Z", payload: { decision: "PASS" } });
  assert.equal(row.created_at, "2026-10-21T04:00:00.000Z");
  assert.deepEqual(row.payload, { decision: "PASS" });
  assert.equal(normalizeReceiptRow({ receipt_type: "independent_validation" }), null);
  assert.equal(normalizeReceiptRow(null), null);
  assert.equal(normalizeReceiptRow("not-a-row"), null);
});
