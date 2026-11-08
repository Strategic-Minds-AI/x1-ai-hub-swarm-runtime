import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  X1_GPT_DRIVE_KIND, X1_GPT_DRIVE_CAPABILITY, X1_GPT_DRIVE_DESTINATION,
  assertGptDriveSignedScope, compileGptDrivePlan, executeGptDriveSync,
} from "../dist/gpt-drive-artifact-sync.js";

const tenant = "11111111-1111-4111-8111-111111111111";
const bytes = Buffer.from("synthetic canary artifact; no private or customer data\n");
const digest = createHash("sha256").update(bytes).digest("hex");
const binding = {
  enabled:true, tenantId:tenant, projectId:"gpt-drive-sync",
  accountEmail:"synthetic@example.test",
  driveId:"fake-shared-drive-id-0000001",
  intakeFolderId:"fake-gpt-downloads-id-000001",
  receiptFolderId:"fake-receipts-folder-id-000001",
  approvedReference:"STAGING-GPT-DRIVE-SYNC-2026",
  allowedProducers:["synthetic-worker"],
};
function makeWork() {
  const taskId = "x1.artifact.sync.synthetic-test-run";
  return {
    tenant_id:tenant, task_id:taskId, action_class:"NON_PRODUCTION_MUTATION",
    work_id:"88888888-8888-4888-8888-888888888888",
    idempotency_key:"a".repeat(64), approval_reference:binding.approvedReference,
    required_capabilities:[{id:X1_GPT_DRIVE_CAPABILITY, mechanism:"policy"}],
    lease:{taskId, holderAgentId:"preview-worker",
      expiresAt:new Date(Date.now()+120000).toISOString()},
    payload:{
      kind:X1_GPT_DRIVE_KIND, artifact_id:"test-artifact",
      project_id:"gpt-drive-sync",run_id:"synthetic-run",
      producer_id:"synthetic-worker",filename:"example.txt",mime_type:"text/plain",
      byte_size:bytes.byteLength,sha256:digest,
      source_ref:"artifact-staging/"+tenant+"/gpt-drive-sync/test-artifact/original.txt",
      classification:"synthetic_test",destination_key:X1_GPT_DRIVE_DESTINATION,
      synthetic:true,no_customer_data:true,no_spend:true,
      customer_outbound:false,release_mode:"staging_only",
    },
  };
}
const signed = (work=makeWork())=>({
  allowed:true, tenant_id:work.tenant_id,task_id:work.task_id,
  requested_action:work.action_class,
  capabilities_required:[X1_GPT_DRIVE_CAPABILITY],
  capabilities_resolved:[X1_GPT_DRIVE_CAPABILITY],blockers:[],
});
const plan = ()=>compileGptDrivePlan(makeWork(),binding,"preview","preview-worker");
function fakeProvider(overrides={}) {
  let count=0;
  const provider = {
    readPrivateSource:async()=>bytes,
    scan:async(_plan,data)=>({
      disposition:"STAGE",sha256:createHash("sha256").update(data).digest("hex"),
    }),
    findExisting:async()=>null,
    createOnly:async()=>{count++; return {fileId:"fake-upload-file-id-12345"};},
    verifyByDownload:async(p,fileId)=>({
      fileId,parentId:p.intakeFolderId,driveId:p.driveId,sha256:p.sha256,
      byteSize:p.byteSize,verifierId:"independent-validator",
      verificationMethod:"remote_download_sha256",
    }),
    storeReceipt:async()=>true,
    ...overrides,
  };
  return {provider,created:()=>count};
}

test("signed scope and bounded plan preserve tenant/project and existing destination",()=>{
  const work=makeWork();
  assert.doesNotThrow(()=>assertGptDriveSignedScope(work,signed(work)));
  const p=plan();assert.equal(p.tenantId,tenant);
  assert.equal(p.sourceRef,work.payload.source_ref);
  assert.equal(p.intakeFolderId,binding.intakeFolderId);
});
test("cross-tenant, project, and producer writes are denied",()=>{
  const w=makeWork();w.tenant_id="22222222-2222-4222-8222-222222222222";
  assert.throws(()=>compileGptDrivePlan(w,binding,"preview","preview-worker"),/TENANT_MISMATCH/);
  const w2=makeWork();w2.payload.project_id="other";
  assert.throws(()=>compileGptDrivePlan(w2,binding,"preview","preview-worker"),/PROJECT_OR_PRODUCER/);
  const w3=makeWork();w3.payload.producer_id="unknown";
  assert.throws(()=>compileGptDrivePlan(w3,binding,"preview","preview-worker"),/PROJECT_OR_PRODUCER/);
});
test("protected actions and forged capabilities are denied before provider",()=>{
  const w=makeWork();w.action_class="PRODUCTION_RELEASE";
  assert.throws(()=>assertGptDriveSignedScope(w,signed(w)),/ACTION_CLASS_DENIED/);
  const w2=makeWork();const a=signed(w2);a.capabilities_resolved=[];
  assert.throws(()=>assertGptDriveSignedScope(w2,a),/SIGNED_SCOPE_DENIED/);
});
test("production context, expired lease, and unapproved reference blocked",()=>{
  const w=makeWork();
  assert.throws(()=>compileGptDrivePlan(w,binding,"production","preview-worker"),/PREVIEW_ENV_REQUIRED/);
  w.lease.expiresAt=new Date(Date.now()-10000).toISOString();
  assert.throws(()=>compileGptDrivePlan(w,binding,"preview","preview-worker"),/LEASE_INVALID/);
  w.lease.expiresAt=new Date(Date.now()+120000).toISOString();w.approval_reference="unknown";
  assert.throws(()=>compileGptDrivePlan(w,binding,"preview","preview-worker"),/APPROVAL_MISMATCH/);
});
test("forged remote URLs, traversal paths and alternate storage refs blocked",()=>{
  for(const ref of ["https://attacker.test/file","artifact-staging/../secrets",
    "artifact-staging/"+tenant+"/gpt-drive-sync/other-artifact/file.txt"]){
    const w=makeWork();w.payload.source_ref=ref;
    assert.throws(()=>compileGptDrivePlan(w,binding,"preview","preview-worker"),/SOURCE_REF_DENIED/);
  }
});
test("only synthetic text canary; no customer data, spend or production release",()=>{
  for(const [key,value,err] of [
    ["mime_type","application/zip","CANARY_CLASSIFICATION"],
    ["no_customer_data",false,"POLICY_DENIED"],
    ["release_mode","production","POLICY_DENIED"],
    ["no_spend",false,"POLICY_DENIED"],
  ]){
    const w=makeWork();w.payload[key]=value;
    assert.throws(()=>compileGptDrivePlan(w,binding,"preview","preview-worker"),new RegExp(err));
  }
});
test("one synthetic file produces verified upload and receipt",async()=>{
  const x=fakeProvider();const receipt=await executeGptDriveSync(plan(),x.provider);
  assert.equal(receipt.status,"CONTENT_VERIFIED");
  assert.equal(x.created(),1);assert.equal(receipt.duplicate,false);
});
test("duplicate content verifies existing file, does not create again",async()=>{
  const x=fakeProvider({findExisting:async()=>"prior-upload-123456789"});
  const receipt=await executeGptDriveSync(plan(),x.provider);
  assert.equal(receipt.duplicate,true);assert.equal(x.created(),0);
});
test("tampered source and REVIEW status never upload",async()=>{
  const altered=fakeProvider({readPrivateSource:async()=>Buffer.from("tampered")});
  await assert.rejects(executeGptDriveSync(plan(),altered.provider),/SOURCE_HASH_MISMATCH/);
  assert.equal(altered.created(),0);
  const pending=fakeProvider({scan:async()=>({disposition:"REVIEW",sha256:digest})});
  await assert.rejects(executeGptDriveSync(plan(),pending.provider),/SCAN_NOT_CLEARED/);
  assert.equal(pending.created(),0);
});
test("remote wrong parent or content hash fails closed",async()=>{
  const bad=fakeProvider({verifyByDownload:async(p,fileId)=>({
    fileId,parentId:"wrong-folder",driveId:p.driveId,sha256:p.sha256,
    byteSize:p.byteSize,verifierId:"validator",verificationMethod:"remote_download_sha256",
  })});
  await assert.rejects(executeGptDriveSync(plan(),bad.provider),/REMOTE_VERIFICATION_FAILED/);
});
test("unknown receipt persistence requires reconciliation, not blind retry",async()=>{
  const x=fakeProvider({storeReceipt:async()=>{throw Error("provider timeout");}});
  await assert.rejects(executeGptDriveSync(plan(),x.provider),/RECEIPT_UNCONFIRMED/);
  assert.equal(x.created(),1);
});
