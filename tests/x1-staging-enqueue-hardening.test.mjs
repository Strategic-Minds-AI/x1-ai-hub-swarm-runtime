import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(name)=>readFileSync(new URL("../ops/security/"+name,import.meta.url),"utf8");

test("staging migration patches existing enqueue without creating another queue",()=>{
  const source=read("x1_staging_enqueue_idempotency_20261011.sql");
  assert.match(source,/uvdkzsbjackpjvpoxtyk/);
  assert.doesNotMatch(source,/vgsmyhqqtkkluhypxyua/);
  assert.match(source,/CREATE OR REPLACE FUNCTION public\.x1_enqueue_work/);
  assert.match(source,/ON CONFLICT \(idempotency_key\) DO NOTHING/);
  assert.doesNotMatch(source,/\bDROP\s+TABLE\b|\bCREATE\s+TABLE\b|\bCREATE\s+EXTENSION\b/i);
});
test("retry of trigger-generated mission ID checks derived mission",()=>{
  const source=read("x1_staging_enqueue_idempotency_20261011.sql");
  assert.match(source,/v_expected_mission:=coalesce/);
  assert.match(source,/v_payload->>'mission_id'/);
  assert.match(source,/v_stored\.mission_id IS DISTINCT FROM v_expected_mission/);
});
test("retry rejects cross-tenant and immutable packet tampering",()=>{
  const source=read("x1_staging_enqueue_idempotency_20261011.sql");
  for(const field of ["tenant_id","task_id","work_packet_id","action_class",
      "required_capabilities","payload","source_sha","requested_by"]) {
    assert.ok(source.includes("v_stored."+field+" IS DISTINCT FROM"),"missing "+field);
  }
  assert.match(source,/WORK_IDEMPOTENCY_CONFLICT/);
});
test("exact original enqueue function is retained for emergency rollback",()=>{
  const original=read("x1_staging_enqueue_idempotency_ROLLBACK_20261011.sql");
  assert.match(original,/v_existing_mission is distinct from nullif/);
  assert.match(original,/CREATE OR REPLACE FUNCTION public\.x1_enqueue_work/);
  assert.match(original,/X1 STAGING uvdkzsbjackpjvpoxtyk/);
});
