import test from "node:test";
import assert from "node:assert/strict";
import { assertReadOnlyCanary, acknowledgeReadOnlyCanary, READ_ONLY_CANARY_KIND }
  from "../dist/read-only-canary.js";

function canary() {
  return {
    action_class: "READ_ONLY",
    mission_id: "X1-READONLY-CANARY-20261111",
    work_packet_id: "WP-X1-CANARY-20261111",
    task_id: "x1.readonly.canary.20261111-a",
    payload: {
      kind: READ_ONLY_CANARY_KIND, synthetic: true, ack_only: true,
      release_mode: "preview", execution_target: "railway",
      no_customer_data: true, no_spend: true, customer_outbound: false,
      external_mutation: false,
    },
  };
}

test("only explicit zero-side-effect synthetic read-only canary is ACKed", () => {
  const work = canary();
  assert.doesNotThrow(() => assertReadOnlyCanary(work, "railway"));
  const response = acknowledgeReadOnlyCanary(work, "railway", "pinned-sha");
  assert.deepEqual(response, {
    kind: READ_ONLY_CANARY_KIND, synthetic: true, acknowledged: true,
    missionId: work.mission_id, workPacketId: work.work_packet_id,
    taskId: work.task_id, sourceSha: "pinned-sha",
  });
  assert.equal(Object.isFrozen(response), true);
});

const negative = [
  ["actual customer research task", w => { w.task_id = "x1.customer.research.001"; }],
  ["noncanary mission", w => { w.mission_id = "X1-REAL-CUSTOMER-RESEARCH"; }],
  ["noncanary packet", w => { w.work_packet_id = "WP-CUSTOMER-001"; }],
  ["untyped read-only work", w => { delete w.payload.kind; }],
  ["unmarked acknowledgement", w => { w.payload.ack_only = false; }],
  ["nonsynthetic input", w => { w.payload.synthetic = false; }],
  ["customer data", w => { w.payload.no_customer_data = false; }],
  ["model spend", w => { w.payload.no_spend = false; }],
  ["customer outreach", w => { w.payload.customer_outbound = true; }],
  ["external mutation", w => { w.payload.external_mutation = true; }],
  ["production intent", w => { w.payload.release_mode = "production"; }],
  ["wrong executor target", w => { w.payload.execution_target = "existing_x1_cloud_worker"; }],
  ["protected action class", w => { w.action_class = "PROTECTED"; }],
];
for (const [label, change] of negative) {
  test("fail closed: " + label, () => {
    const work = canary();
    change(work);
    assert.throws(() => acknowledgeReadOnlyCanary(work, "railway"),
      {message: "READ_ONLY_HANDLER_NOT_IMPLEMENTED"});
  });
}

test("local-ollama canary must match its own execution target", () => {
  const work = canary();
  assert.throws(() => acknowledgeReadOnlyCanary(work, "local-ollama"),
    {message: "READ_ONLY_HANDLER_NOT_IMPLEMENTED"});
  work.payload.execution_target = "local-ollama";
  assert.equal(acknowledgeReadOnlyCanary(work, "local-ollama").synthetic, true);
});
