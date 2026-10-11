import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createCodingDispatchHandler, codingCandidateHash } from "../dist/coding-dispatch-handler.js";
const clock = Date.parse("2026-10-11T23:00:00Z");
const work = () => ({ work_id:"w",mission_id:"m",work_packet_id:"p",task_id:"t",
  tenant_id:"tenant",requested_by:"operator",action_class:"NON_PRODUCTION_MUTATION",
  required_capabilities:[],source_sha:"a".repeat(40),idempotency_key:"b".repeat(64),attempt:1,
  payload:{kind:"X1_CODING_AGENT_V1",repo:"Strategic-Minds-AI/X1-OPERATING-SYSTEM",
    branch:"feature/canary",objective:"Add a scoped test",allowed_paths:["tests/canary.mjs"],validation:["unit"]},
  lease:{leaseId:"l",taskId:"t",holderAgentId:"worker",acquiredAt:new Date(clock-1000).toISOString(),expiresAt:new Date(clock+60000).toISOString()} });
const proposal = () => ({summary:"test",changes:[{path:"tests/canary.mjs",content:"export const x = 1;",explanation:"fixture"}]});
function setup(overrides={}) {
  const receipts=[];let calls=0;
  const adapters={propose:async()=>{calls++;return proposal();},
    verify:async(_p,c)=>({accepted:true,checks:[{name:"unit",pass:true,evidence:"fixture checked"}],
      reviewerId:"qa",reviewId:"r",basedOnSourceSha:"a".repeat(40),candidateHash:codingCandidateHash(c)}),
    record:async r=>receipts.push(r)};
  const config={enabled:true,environment:"preview",tenantId:"tenant",workerId:"worker",builderId:"builder",
    reviewerId:"qa",authorizationReceiptId:"scoped-test-grant",adapters,now:()=>clock,...overrides};
  return {config,adapters,receipts,calls:()=>calls};
}
test("disabled and production dispatcher never invokes proposer",async()=>{
  for(const override of [{enabled:false},{authorizationReceiptId:undefined},{environment:"production"}]) {
    const s=setup(override);await assert.rejects(createCodingDispatchHandler(s.config)(work()));assert.equal(s.calls(),0);
  }
});
test("rejects tenant, worker, task and expired lease before proposal",async()=>{
  for(const mutate of [w=>w.tenant_id="other",w=>w.lease.holderAgentId="other",w=>w.lease.taskId="other",
    w=>w.lease.expiresAt=new Date(clock).toISOString()]) {
    const s=setup();const w=work();mutate(w);await assert.rejects(createCodingDispatchHandler(s.config)(w));assert.equal(s.calls(),0);
  }
});
test("reviewed proposal remains explicitly dry-run without build completion claims",async()=>{
  const s=setup();const out=await createCodingDispatchHandler(s.config)(work());
  assert.equal(out.dryRun,true);assert.equal(out.codeWritten,false);assert.equal(out.deployed,false);
  assert.equal(s.receipts.length,1);assert.equal(out.receipt.outcome,"PLAN_READY");
});
test("wrong candidate hash and reviewer identity cannot pass",async()=>{
  for(const override of [{candidateHash:"c".repeat(64)},{reviewerId:"other"}]) {
    const s=setup();const verify=s.adapters.verify;s.adapters.verify=async(p,c)=>({...await verify(p,c),...override});
    await assert.rejects(createCodingDispatchHandler(s.config)(work()),/PROPOSAL_BLOCKED/);
    assert.equal(s.calls(),1);assert.equal(s.receipts[0].outcome,"REPAIR_EXHAUSTED");
  }
});
test("lease expiration while proposing prevents independent review",async()=>{
  let now=clock;const s=setup({now:()=>now});let reviews=0;
  s.adapters.propose=async()=>{now=clock+61000;return proposal();};s.adapters.verify=async()=>{reviews++;throw Error("unexpected");};
  await assert.rejects(createCodingDispatchHandler(s.config)(work()),/LEASE_EXPIRED/);assert.equal(reviews,0);
  assert.equal(s.receipts.length,1);
});
test("same builder and reviewer are rejected before proposal",async()=>{
  const s=setup({reviewerId:"builder"});await assert.rejects(createCodingDispatchHandler(s.config)(work()),/IDENTITY/);assert.equal(s.calls(),0);
});
test("reviewer mutation of candidate is rejected",async()=>{
  const s=setup();const verify=s.adapters.verify;s.adapters.verify=async(p,c)=>{
    const r=await verify(p,c);c.changes[0].content="changed after review";return r;
  };
  await assert.rejects(createCodingDispatchHandler(s.config)(work()),/PROPOSAL_BLOCKED/);
});
