import test from "node:test";
import assert from "node:assert/strict";
import {assertIndependentQaConfig,requireIndependentQaProof} from "../dist/x1-preview-qa-handoff.js";
const W="11111111-1111-4111-8111-111111111111",T="22222222-2222-4222-8222-222222222222";
const SOURCE="f".repeat(40),HTML="a".repeat(64),QA="x1-browser-qa-staging",BUILDER="x1-swarm-preview-1";
const ENDPOINT="https://cloud-browser-mcp-staging-staging.up.railway.app/api/x1/validate-preview";
const base=()=>({
 work_id:W,tenant_id:T,task_id:"x1.preview.build."+W,
 source_sha:SOURCE,
 lease:{leaseId:"lease-"+W,taskId:"x1.preview.build."+W,holderAgentId:BUILDER,
 acquiredAt:new Date(Date.now()-2000).toISOString(),expiresAt:new Date(Date.now()+240000).toISOString()}
});
const build=()=>({kind:"X1_PROMPT_TO_VERCEL_PREVIEW_V1",status:"PREVIEW_BYTES_VERIFIED_PENDING_INDEPENDENT_BROWSER_QA",
 work_id:W,tenant_id:T,source_sha:"b".repeat(40),html_sha256:HTML,
 deployment_id:"dpl_TestQA123456",preview_url:"https://website-launch-engine-abc123-strategic-minds-advisory.vercel.app/",
 release:"PREVIEW_ONLY",independent_qa:"PENDING"});
const proof=()=>({
 receipt_id:"X1_QA_11111111-1111-4111-8111-111111111111",
 validator_id:QA,work_id:W,tenant_id:T,source_sha:SOURCE,
 html_sha256:HTML,deployment_id:"dpl_TestQA123456",status:"PASS",database_receipt_persisted:true
});
const validConfig=fetchImpl=>({
 enabled:true,endpoint:ENDPOINT,bearerToken:"synthetic-test-qa-token-only-123",
 validatorId:QA,workerId:BUILDER,fetchImpl
});
test("existing worker cannot run QA without a distinct, bound validator",()=>{
 const w=base();const c=validConfig();
 for(const patch of [
  {enabled:false},{validatorId:BUILDER},{bearerToken:""},
  {endpoint:"http://127.0.0.1:8000/api/x1/validate-preview"},
  {endpoint:"https://evil.example/api/x1/validate-preview"},
  {endpoint:"https://cloud-browser-mcp-staging-staging.up.railway.app/other"},
  {endpoint:"https://user:password@cloud-browser-mcp-staging-staging.up.railway.app/api/x1/validate-preview"}
 ])assert.throws(()=>assertIndependentQaConfig({...c,...patch},w));
 assert.doesNotThrow(()=>assertIndependentQaConfig(c,w));
});
test("validator must be independent and persist source-hashed QA before ledger completion",async()=>{
 let calls=0;
 const fetchImpl=async(url,init)=>{
  calls++;
  assert.equal(url,ENDPOINT);
  assert.equal(init.method,"POST");
  assert.equal(init.headers.authorization,"Bearer synthetic-test-qa-token-only-123");
  const packet=JSON.parse(init.body);
  assert.equal(packet.kind,"X1_PREVIEW_INDEPENDENT_BROWSER_QA_V1");
  assert.equal(packet.builder_id,BUILDER);
  assert.equal(packet.expected_validator_id,QA);
  assert.equal(packet.html_sha256,HTML);
  assert.equal(packet.approved_source_sha,SOURCE);
  assert.equal(packet.required_viewports[0].width,1440);
  assert.equal(packet.required_viewports[1].width,390);
  return new Response(JSON.stringify(proof()),{status:200});
 };
 const result=await requireIndependentQaProof(base(),build(),validConfig(fetchImpl));
 assert.equal(result.receipt_id,proof().receipt_id);
 assert.equal(result.status,"PASS");
 assert.equal(calls,1);
});
test("negative: reviewer self-certification, unpersisted data and hash drift rejected",async()=>{
 let calls=0;
 for(const changes of [
  {validator_id:BUILDER},{status:"FAIL"},{database_receipt_persisted:false},
  {tenant_id:"99999999-9999-4999-8999-999999999999"},
  {source_sha:"c".repeat(40)},{html_sha256:"e".repeat(64)},
  {deployment_id:"dpl_Fake9999"},{receipt_id:""},
 ]){
  await assert.rejects(()=>requireIndependentQaProof(base(),build(),
    validConfig(async()=>{calls++;return new Response(JSON.stringify({...proof(),...changes}),{status:200});})),
    /X1_QA_INDEPENDENT_RECEIPT_MISMATCH/);
 }
 assert.equal(calls,8);
});
test("negative: invalid source or stopped lease never triggers remote QA",async()=>{
 let calls=0;
 const qa=validConfig(async()=>{calls++;return new Response(JSON.stringify(proof()),{status:200});});
 const old=base();
 old.lease.expiresAt=new Date(Date.now()+9000).toISOString();
 await assert.rejects(()=>requireIndependentQaProof(old,build(),qa),/X1_PREVIEW_LEASE_NOT_SAFE_FOR_EXTERNAL_WRITE/);
 const fake={...build(),preview_url:"https://another.example/"};
 await assert.rejects(()=>requireIndependentQaProof(base(),fake,qa),/X1_QA_PREVIEW_TARGET_DENIED/);
 assert.equal(calls,0);
});
test("negative: network unreachable or accepted HTTP without proof cannot complete",async()=>{
 const fail=validConfig(async()=>{throw Error("timeout");});
 await assert.rejects(()=>requireIndependentQaProof(base(),build(),fail),/X1_QA_VALIDATOR_UNREACHABLE_OR_TIMEOUT/);
 const bad=validConfig(async()=>new Response(JSON.stringify(proof()),{status:503}));
 await assert.rejects(()=>requireIndependentQaProof(base(),build(),bad),/X1_QA_VALIDATOR_REJECTED_503/);
});
