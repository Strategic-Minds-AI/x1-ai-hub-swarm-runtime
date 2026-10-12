import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  assertWlePrivateQaConfig, requireWlePrivateQaProof,
  WLE_PRIVATE_VALIDATOR_ENDPOINT
} from "../dist/wle-private-qa-handoff.js";
import {WLE_APPROVED_SOURCE_SHA,WLE_PREVIEW_KIND} from "../dist/wle-preview-adapter.js";

const W="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const T="666f23bf-61bd-4be0-b5cb-4872e04fad9b";
const TASK="wle.preview.synthetic.roofing-end-to-end";
const LEASE="11111111-2222-4333-8444-555555555555";
const WORKER="x1-swarm-preview-1",GUARDIAN="x1-independent-private-artifact-validator";
const PATH="wle-preview/"+T+"/"+W+"/index.html";
const hash="a".repeat(64),templateHash="b".repeat(64);
const work=()=>({
  work_id:W,tenant_id:T,task_id:TASK,action_class:"NON_PRODUCTION_MUTATION",
  payload:{kind:WLE_PREVIEW_KIND},source_sha:WLE_APPROVED_SOURCE_SHA,
  lease:{leaseId:LEASE,taskId:TASK,holderAgentId:WORKER,
    acquiredAt:new Date(Date.now()-1000).toISOString(),
    expiresAt:new Date(Date.now()+240000).toISOString()}
});
const artifact=()=>({
 kind:"WLE_STAGING_PRIVATE_PREVIEW_V1",work_id:W,tenant_id:T,
 source_sha:WLE_APPROVED_SOURCE_SHA,approved_template_sha256:templateHash,
 sha256:hash,byte_size:16255,storage_bucket:"artifact-staging",
 storage_path:PATH,storage_verified:true,private:true,noindex:true,
 released:false,public_url:null,worker_id:WORKER
});
const config=(patch={})=>({
  enabled:true,endpoint:WLE_PRIVATE_VALIDATOR_ENDPOINT,
  bearerToken:"synthetic-only-validator-test-token-at-least-24-chars",
  validatorId:GUARDIAN,workerId:WORKER,...patch
});
const proof=(patch={})=>({
  kind:"WLE_PRIVATE_PREVIEW_INDEPENDENT_QA_V1",
  receipt_id:"X1_WLE_PRIVATE_QA_11111111-2222-4333-8444-555555555555",
  validator_id:GUARDIAN,work_id:W,tenant_id:T,task_id:TASK,
  lease_id:LEASE,source_sha:WLE_APPROVED_SOURCE_SHA,artifact_sha256:hash,
  byte_size:16255,storage_path:PATH,status:"PASS",database_receipt_persisted:true,
  bucket_private:true,noindex:true,released:false,...patch
});
const send=answer=>async (_url,init)=>new Response(JSON.stringify(answer),{status:200,
  headers:{"content-type":"application/json"}});
test("private WLE preview requires a distinct bound validator before upload",()=>{
  for(const p of [
    {enabled:false},{validatorId:WORKER},{validatorId:""},
    {bearerToken:""},{bearerToken:"short"},
    {endpoint:"https://evil.example/api/x1/validate-wle-private-preview"},
    {endpoint:"https://cloud-browser-mcp-staging-staging.up.railway.app/api/x1/validate-preview"},
    {endpoint:WLE_PRIVATE_VALIDATOR_ENDPOINT+"?bypass=1"},
    {timeoutMs:20001},{timeoutMs:0}
  ]) assert.throws(()=>assertWlePrivateQaConfig(config(p),work()),/WLE_PRIVATE_QA_/);
});
test("wrong action and source, another worker and expired lease fail closed",()=>{
  for(const patch of [
    {action_class:"READ_ONLY"},{source_sha:"f".repeat(40)},
    {lease:{...work().lease,holderAgentId:"other-worker"}},
    {lease:{...work().lease,expiresAt:new Date(Date.now()-1000).toISOString()}}
  ]) assert.throws(()=>assertWlePrivateQaConfig(config(),{...work(),...patch}));
});
test("one independent private artifact validation binds tenant, lease, hash and exact storage object",async()=>{
  let calls=0;
  const fetchImpl=async(url,init)=>{
    calls++;
    assert.equal(url,WLE_PRIVATE_VALIDATOR_ENDPOINT);
    assert.equal(init.method,"POST");
    assert.equal(init.headers.authorization,"Bearer "+config().bearerToken);
    const body=JSON.parse(init.body);
    assert.equal(body.kind,"WLE_PRIVATE_PREVIEW_INDEPENDENT_QA_V1");
    assert.equal(body.tenant_id,T);
    assert.equal(body.lease_id,LEASE);
    assert.equal(body.storage_bucket,"artifact-staging");
    assert.equal(body.storage_path,PATH);
    assert.equal(body.artifact_sha256,hash);
    assert.equal(body.release,"PRIVATE_STAGING_ONLY");
    assert.equal(body.credentials_in_payload,false);
    assert.equal(JSON.stringify(body).includes("synthetic-only-validator-test-token"),false);
    return send(proof())();
  };
  const qa=await requireWlePrivateQaProof(work(),artifact(),config({fetchImpl}));
  assert.equal(calls,1);assert.equal(qa.status,"PASS");
  assert.equal(qa.validator_id,GUARDIAN);
});
test("false independent QA receipt is rejected, even with HTTP 200",async(t)=>{
  for(const patch of [
    {status:"PENDING"},{database_receipt_persisted:false},{validator_id:WORKER},
    {validator_id:"attacker"},{work_id:"wrong-id"},{tenant_id:"other-tenant"},
    {task_id:"wrong-task"},{lease_id:"bad-lease"},
    {source_sha:"f".repeat(40)},{artifact_sha256:"f".repeat(64)},
    {byte_size:1},{storage_path:"wle-preview/foreign/index.html"},
    {bucket_private:false},{noindex:false},{released:true},
    {receipt_id:"mock-receipt"},{kind:"X1_PREVIEW_INDEPENDENT_BROWSER_QA_V1"}
  ]) await t.test(Object.keys(patch)[0]+":"+String(Object.values(patch)[0]).slice(0,28),async()=>{
    await assert.rejects(requireWlePrivateQaProof(work(),artifact(),
      config({fetchImpl:send(proof(patch))})),/WLE_PRIVATE_QA_INDEPENDENT_RECEIPT_MISMATCH/);
  });
});
test("mismatched private storage artifact cannot reach validator",async(t)=>{
  for(const patch of [
    {storage_bucket:"public-images"},{storage_path:"wle-preview/other/index.html"},
    {source_sha:"c".repeat(40)},{worker_id:"builder-attacker"},
    {sha256:"not-sha"},{private:false},{noindex:false},{released:true},
    {storage_verified:false},{public_url:"https://attacker.example"},
  ]) await t.test(Object.keys(patch)[0],async()=>{
    let calls=0;
    await assert.rejects(requireWlePrivateQaProof(work(),{...artifact(),...patch},
      config({fetchImpl:async()=>{calls++;throw Error("should-not-call")}})),
      /WLE_PRIVATE_QA_ARTIFACT_MISMATCH/);
    assert.equal(calls,0);
  });
});
test("validator transport failure and fake successful JSON cannot complete",async()=>{
  await assert.rejects(requireWlePrivateQaProof(work(),artifact(),config({
    fetchImpl:async()=>{throw Error("timeout")}})),/WLE_PRIVATE_QA_VALIDATOR_UNREACHABLE/);
  await assert.rejects(requireWlePrivateQaProof(work(),artifact(),config({
    fetchImpl:async()=>new Response("down",{status:503})})),/WLE_PRIVATE_QA_VALIDATOR_REJECTED_503/);
  await assert.rejects(requireWlePrivateQaProof(work(),artifact(),config({
    fetchImpl:async()=>new Response("not-json",{status:200})})),/WLE_PRIVATE_QA_RESPONSE_INVALID/);
});
test("shared gateway requires independent WLE preflight before private storage and preserves generic QA",()=>{
  const s=readFileSync(new URL("../src/worker-main-gateway.ts",import.meta.url),"utf8");
  const first=s.indexOf("assertWlePrivateQaConfig(wleQaConfig,work)");
  const upload=s.indexOf("const artifact=await handleWleSyntheticPreview(work");
  const independent=s.indexOf("const qa=await requireWlePrivateQaProof(work,artifact,wleQaConfig)");
  assert.ok(first>=0 && upload>first && independent>upload);
  assert.match(s,/required\("WLE_PRIVATE_QA_ENDPOINT"\)/);
  assert.match(s,/required\("WLE_PRIVATE_QA_VALIDATOR_ID"\)/);
  assert.match(s,/process\.env\.WLE_PRIVATE_QA_ENABLED==="true"/);
  assert.match(s,/process\.env\.WLE_PRIVATE_QA_FENCE_VERIFIED!=="true"/);
  assert.match(s,/assertIndependentQaConfig\(qaConfig,work\)/);
  assert.match(s,/requireIndependentQaProof\(work,build,qaConfig\)/);
});
