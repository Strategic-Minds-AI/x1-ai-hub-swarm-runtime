import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const base=new URL("../ops/security/",import.meta.url);
const migration=readFileSync(new URL("x1_eden_factory_canary_exact_admission_20261114.sql",base),"utf8");
const rollback=readFileSync(new URL("x1_eden_factory_canary_exact_admission_ROLLBACK_20261114.sql",base),"utf8");
function sections(sql) {
 const next=sql.indexOf("CREATE OR REPLACE FUNCTION public.x1_lease_next_work(");
 const byid=sql.indexOf("CREATE OR REPLACE FUNCTION public.x1_lease_work_by_id(");
 assert.ok(next>=0&&byid>next,"both original RPCs preserved");
 return [sql.slice(next,byid),sql.slice(byid)];
}
const [next,byid]=sections(migration);
const both=[next,byid];
test("transactional staging-only source preserves rollback and never auto-activates",()=>{
 assert.match(migration,/^BEGIN;/m);
 assert.match(migration,/SET LOCAL lock_timeout='4s'/);
 assert.match(migration,/SET LOCAL statement_timeout='25s'/);
 assert.match(migration,/X1_EDEN_WORKER_PERMISSION_DRIFT/);
 assert.match(migration,/X1_EDEN_CANARY_ALREADY_EXISTS/);
 assert.ok(migration.trimEnd().endsWith("COMMIT;"));
 assert.doesNotMatch(migration,/UPDATE\s+private\.x1_worker_registry\s+SET\s+allowed_action_classes/i);
 assert.doesNotMatch(migration,/GRANT\s+EXECUTE\s+ON\s+FUNCTION/i);
 assert.ok(rollback.trimEnd().endsWith("COMMIT;"));
 assert.equal(sections(rollback).length,2);
 assert.doesNotMatch(rollback,/X1_EDEN_CANARY_ADMISSION_V1/);
});
test("both RPC paths deny all preview-worker non-canary mutations",()=>{
 for(const body of both){
  assert.match(body,/X1_EDEN_CANARY_ADMISSION_V1/);
  assert.match(body,/q\.task_id <> 'eden\.factory\.canary\.20261114'/);
  assert.match(body,/p_worker_id <> 'x1-swarm-preview-1' or q\.action_class='READ_ONLY'/);
  assert.match(body,/q\.task_id = 'eden\.factory\.canary\.20261114'/);
  assert.match(body,/p_environment='preview'/);
 }
});
test("both RPC paths pin exact tenant, SHA, repo, branch and one path",()=>{
 for(const body of both){
  for(const value of [
   "666f23bf-61bd-4be0-b5cb-4872e04fad9b",
   "EDEN-UNIVERSAL-MCP-FACTORY-20261114",
   "72b0b78afa6ebf0dc6693683ee0a9a20d618baa9",
   "7ab67b1524eb880c2bc3437c9350dadb756a002d1f45a3dea0b19d56737f7a6a",
   "Strategic-Minds-AI/eden-universal-mcp-factory",
   "feature/eden-autocode-reconciler-20261114",
   "tests/x1-worker-canary.test.mjs",
   "x1:eden-factory-canary:v1"
  ])assert.ok(body.includes(value),"missing exact pinned value: "+value);
 }
});
test("atomic leases require one attempt, one idempotency key and disabled-by-default metadata",()=>{
 for(const body of both){
  assert.match(body,/q\.attempts=0/);
  assert.match(body,/q\.max_attempts=1/);
  assert.match(body,/q\.lease_id IS NULL/);
  assert.match(body,/eden_factory_canary_enabled'='true'/);
  assert.match(body,/NON_PRODUCTION_MUTATION' = ANY\(v_worker\.allowed_action_classes\)/);
  assert.match(body,/now\(\)<'2026-11-16 12:00:00\+00'/);
  assert.match(body,/for update skip locked/i);
 }
});
test("the by-ID bypass now verifies this worker's registry and controller guard",()=>{
 assert.match(byid,/X1_EDEN_WORKER_CONTEXT_INVALID/);
 assert.match(byid,/private\.x1_worker_registry/);
 assert.match(byid,/private\.x1_worker_control_guard/);
 assert.match(byid,/wr\.credential_binding_state='BOUND'/);
 assert.match(byid,/cg\.lease_allowed=true/);
 assert.match(byid,/where q\.work_id=p_work_id/);
});
test("the exact canary payload cannot contain spending, production or unreviewed paths",()=>{
 for(const body of both){
  assert.match(body,/q\.payload=jsonb_build_object/);
  assert.match(body,/'no_spend',true/);
  assert.match(body,/'synthetic',true/);
  assert.match(body,/'production_release',false/);
  assert.match(body,/'customer_outbound',false/);
  assert.match(body,/q\.required_capabilities=jsonb_build_array/);
  assert.match(body,/q\.approval_reference IS NULL/);
 }
});
