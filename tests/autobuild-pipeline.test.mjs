import { test } from "node:test";
import { strict as assert } from "node:assert";
import { runAutoBuildDryRun } from "../dist/autobuild-pipeline.js";

const work = () => ({
 work_id:"work-1",mission_id:"X1-AVATAR-STUDIO-20261011",work_packet_id:"WP-X1-VALIDATE-001",
 task_id:"WP-X1-VALIDATE-001",tenant_id:"tenant-test",requested_by:"operator",
 action_class:"NON_PRODUCTION_MUTATION",required_capabilities:[],
 source_sha:"a".repeat(40),idempotency_key:"b".repeat(64),
 payload:{kind:"X1_CODING_AGENT_V1",repo:"Strategic-Minds-AI/X1-OPERATING-SYSTEM",
  branch:"feature/x1-avatar-studio-foundation-20261011",objective:"Add a safe unit test",
  allowed_paths:["tests/safe.test.mjs"],validation:["unit","independent_review"]},
 attempt:1,lease:{leaseId:"lease",taskId:"WP-X1-VALIDATE-001",holderAgentId:"x1-preview",acquiredAt:"2026-10-11T00:00:00Z",expiresAt:"2099-01-01T00:00:00Z"}
});
const proposal=()=>({summary:"Add test",changes:[{path:"tests/safe.test.mjs",content:"test('safe',()=>{});",explanation:"A scoped unit test"}]});
const review=(pass)=>({accepted:pass,reviewerId:"independent-qa",reviewId:"qa-1",basedOnSourceSha:"a".repeat(40),
 checks:[{name:"unit",pass,evidence:pass?"unit PASS":"unit failed"},{name:"independent_review",pass:true,evidence:"reviewed exact source SHA"}]});
test("one pass records independent dry-run receipt without publishing",async()=>{
 const receipts=[];
 const out=await runAutoBuildDryRun(work(),{
  propose:async()=>proposal(),verify:async()=>review(true),record:async(r)=>{receipts.push(r);}
 });
 assert.equal(out.outcome,"PLAN_READY");assert.equal(out.dryRun,true);assert.equal(receipts.length,1);
 assert.deepEqual(out.candidatePaths,["tests/safe.test.mjs"]);
});
test("a bounded failing validation attempts repair at most three times",async()=>{
 let count=0;const receipts=[];
 const out=await runAutoBuildDryRun(work(),{
  propose:async(_p,failures)=>{count++;if(count>1)assert.ok(failures.length);return proposal();},
  verify:async()=>review(false),record:async r=>{receipts.push(r);}
 });
 assert.equal(out.outcome,"REPAIR_EXHAUSTED");assert.equal(count,3);assert.equal(receipts.length,3);
});
test("rejects proposal outside allowlist without repeated attempts",async()=>{
 let attempts=0;
 const out=await runAutoBuildDryRun(work(),{
  propose:async()=>{attempts++;return {summary:"bad",changes:[{path:"../../.env",content:"BAD",explanation:"bad"}]};},
  verify:async()=>review(true),record:async()=>{}
 });
 assert.equal(out.outcome,"BLOCKED");assert.equal(attempts,1);
});
test("does not accept review from wrong source SHA",async()=>{
 let count=0;
 const out=await runAutoBuildDryRun(work(),{
  propose:async()=>{count++;return proposal();},
  verify:async()=>({...review(true),basedOnSourceSha:"c".repeat(40)}),record:async()=>{}
 });
 assert.equal(out.outcome,"BLOCKED");assert.equal(count,1);
});
test("does not accept missing independently required checks",async()=>{
 const out=await runAutoBuildDryRun(work(),{
  propose:async()=>proposal(),verify:async()=>({...review(true),checks:[{name:"unit",pass:true,evidence:"yes"}]}),record:async()=>{}
 });
 assert.equal(out.outcome,"BLOCKED");
});
test("nonboolean review decisions fail closed without repair retries",async()=>{
 for (const malformed of [
  {...review(true),accepted:"false"},
  {...review(true),checks:review(true).checks.map(c=>({...c,pass:"false"}))},
 ]) {
  let proposals=0;
  const out=await runAutoBuildDryRun(work(),{
   propose:async()=>{proposals++;return proposal();},
   verify:async()=>malformed,record:async()=>{}
  });
  assert.equal(out.outcome,"BLOCKED");assert.equal(proposals,1);
 }
});
test("duplicate validation check names cannot certify a proposal",async()=>{
 const r=review(true);r.checks.push({...r.checks[0]});
 const out=await runAutoBuildDryRun(work(),{
  propose:async()=>proposal(),verify:async()=>r,record:async()=>{}
 });
 assert.equal(out.outcome,"BLOCKED");
});
