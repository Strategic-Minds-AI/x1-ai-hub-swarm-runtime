import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql=readFileSync(new URL("../ops/security/x1_staging_recovery_fencing_20261011.sql",import.meta.url),"utf8");
const rollback=readFileSync(new URL("../ops/security/x1_staging_recovery_fencing_ROLLBACK_20261011.sql",import.meta.url),"utf8");

test("recovery patch is staging-only and reuses current recovery RPC",()=>{
  assert.match(sql,/uvdkzsbjackpjvpoxtyk/);
  assert.doesNotMatch(sql,/vgsmyhqqtkkluhypxyua/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.x1_recover_expired_leases/);
  assert.doesNotMatch(sql,/\bCREATE\s+TABLE\b|\bDROP\s+TABLE\b|\bcron\.schedule\b/i);
});
test("lost final queue ack only repaired from completed ledger and matching durable receipt",()=>{
  for(const gate of [
    "q.status='LEASED'","l.status='COMPLETED'",
    "e.state='COMPLETED'","e.receipt_id IS NOT NULL",
    "ar.receipt_type='worker_execution'",
    "ar.content_hash=",
    "ar.payload->>'execution_id'=e.execution_id::text",
  ]) assert.ok(sql.includes(gate),"Missing recovery receipt guard: "+gate);
});
test("expired mutating work or ambiguous execution is BLOCKED, not auto-replayed",()=>{
  assert.match(sql,/v_row\.has_ambiguous_execution OR v_row\.action_class <> 'READ_ONLY'/);
  assert.match(sql,/LEASE_EXPIRED_UNCERTAIN_EXECUTION/);
  assert.match(sql,/status='BLOCKED'/);
  assert.match(sql,/ON CONFLICT \(tenant_id,receipt_type,receipt_id\) DO NOTHING/);
});
test("ordinary expired READ_ONLY can still recover without creating a second loop",()=>{
  assert.match(sql,/status='PENDING',lease_id=NULL/);
  assert.match(sql,/LEASE_EXPIRED_REQUEUED/);
  assert.match(sql,/FOR UPDATE OF l,q SKIP LOCKED/);
  assert.match(sql,/RECOVERY_LIMIT_OUT_OF_RANGE/);
});
test("rollback preserves the original recovery function for break-glass only",()=>{
  assert.match(rollback,/BREAK-GLASS ONLY/);
  assert.match(rollback,/CREATE OR REPLACE FUNCTION public\.x1_recover_expired_leases/);
  assert.match(rollback,/LEASE_EXPIRED_REQUEUED/);
  assert.doesNotMatch(rollback,/CREATE TABLE|DROP TABLE/);
});
