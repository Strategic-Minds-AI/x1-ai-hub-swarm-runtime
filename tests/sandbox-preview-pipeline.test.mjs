import test from "node:test";
import assert from "node:assert/strict";
import {prepareWorkspace,runSandboxPreview,SandboxGuardError} from "../dist/index.js";

const started=new Date("2026-10-11T04:00:00Z");
const tenantId="00000000-0000-0000-0000-000000000001";
const sha="1".repeat(40);
function setup(overrides={}){
  const workspace=prepareWorkspace({tenantId,clientSlug:"synthetic",missionId:"mission_preview_001",idempotencyKey:"preview-replay-key-123",sourceSha:sha,ttlMinutes:30},started);
  const actor={verifiedByServer:true,approvedScope:"sandbox",tenantId};
  const resource={provider:"vercel",ownerTag:workspace.ownerTag,resourceKey:workspace.resourcePrefix+"preview/demo",externalId:"synthetic-only",environment:"preview"};
  let buildCount=0,repairs=0,archiveWrites=0;
  const builder={identity:"builder-worker",build:async()=>{buildCount++;return {artifactSha256:"a".repeat(64),sourceSha:sha,previewUrl:"https://synthetic-preview.example"};},repair:async()=>{repairs++;return {artifactSha256:"b".repeat(64),sourceSha:sha,previewUrl:"https://synthetic-preview.example"};}};
  const validator={identity:"separate-validator",validate:async(_w,a)=>({artifactSha256:a.artifactSha256,validatorId:"separate-validator",passed:true,desktopPassed:true,mobilePassed:true,routesPassed:true,syntheticLeadPassed:true})};
  const archive={write:async(_w,a)=>{archiveWrites++;return {artifactSha256:a.artifactSha256,archiveReceiptId:"hash-bound-synthetic-receipt",verified:true};}};
  return {workspace,actor,resource,builder,validator,archive,clock:()=>started,counters:()=>({buildCount,repairs,archiveWrites}),...overrides};
}
test("healthy mock pipeline archives only after independent proof",async()=>{
  const ctx=setup();const r=await runSandboxPreview(ctx);
  assert.equal(r.status,"ARCHIVED");assert.equal(r.workspace.archivesVerified,true);assert.equal(r.attempts,1);
  assert.deepEqual(ctx.counters(),{buildCount:1,repairs:0,archiveWrites:1});
});
test("mock validation failure repaired once then archived",async()=>{
  const ctx=setup();let checks=0;
  ctx.validator.validate=async(_w,a)=>({artifactSha256:a.artifactSha256,validatorId:"separate-validator",passed:++checks===2,desktopPassed:true,mobilePassed:true,routesPassed:true,syntheticLeadPassed:true});
  const r=await runSandboxPreview(ctx);
  assert.equal(r.status,"ARCHIVED");assert.equal(r.attempts,2);assert.equal(ctx.counters().repairs,1);
});
test("max repair cap prevents uncontrolled iteration",async()=>{
  const ctx=setup({maxRepairs:1});
  ctx.validator.validate=async(_w,a)=>({artifactSha256:a.artifactSha256,validatorId:"separate-validator",passed:false,desktopPassed:false,mobilePassed:false,routesPassed:false,syntheticLeadPassed:false});
  const r=await runSandboxPreview(ctx);
  assert.equal(r.status,"FAILED");assert.equal(r.reason,"VALIDATION_REPAIR_EXHAUSTED");
  assert.equal(ctx.counters().repairs,1);assert.equal(ctx.counters().archiveWrites,0);
});
test("builder and validator cannot share identity",async()=>{
  const ctx=setup();ctx.validator.identity="builder-worker";
  await assert.rejects(runSandboxPreview(ctx),e=>e instanceof SandboxGuardError&&e.code==="INDEPENDENT_VALIDATOR_REQUIRED");
});
test("unverified archive is never marked successful",async()=>{
  const ctx=setup();
  ctx.archive.write=async(_w,a)=>({artifactSha256:a.artifactSha256,archiveReceiptId:"none",verified:false});
  await assert.rejects(runSandboxPreview(ctx),e=>e instanceof SandboxGuardError&&e.code==="ARCHIVE_INTEGRITY_FAILED");
});
test("synthetic validator cannot give a different SHA a PASS",async()=>{
  const ctx=setup({maxRepairs:0});
  ctx.validator.validate=async()=>({artifactSha256:"f".repeat(64),validatorId:"separate-validator",passed:true,desktopPassed:true,mobilePassed:true,routesPassed:true,syntheticLeadPassed:true});
  const r=await runSandboxPreview(ctx);assert.equal(r.status,"FAILED");
});
test("mobile failure blocks archive even if validator reports passed",async()=>{
  const ctx=setup({maxRepairs:0});
  ctx.validator.validate=async(_w,a)=>({artifactSha256:a.artifactSha256,validatorId:"separate-validator",passed:true,desktopPassed:true,mobilePassed:false,routesPassed:true,syntheticLeadPassed:true});
  const r=await runSandboxPreview(ctx);assert.equal(r.status,"FAILED");
});
test("missing synthetic lead proof blocks archive",async()=>{
  const ctx=setup({maxRepairs:0});
  ctx.validator.validate=async(_w,a)=>({artifactSha256:a.artifactSha256,validatorId:"separate-validator",passed:true,desktopPassed:true,mobilePassed:true,routesPassed:true,syntheticLeadPassed:false});
  const r=await runSandboxPreview(ctx);assert.equal(r.status,"FAILED");
});
test("cross tenant caller never gets to builder",async()=>{
  const ctx=setup();ctx.actor.tenantId="00000000-0000-0000-0000-000000000002";
  await assert.rejects(runSandboxPreview(ctx),e=>e instanceof SandboxGuardError&&e.code==="CROSS_TENANT_DENIED");
  assert.equal(ctx.counters().buildCount,0);
});
test("production resource never executes",async()=>{
  const ctx=setup();ctx.resource.environment="production";
  await assert.rejects(runSandboxPreview(ctx),e=>e instanceof SandboxGuardError&&e.code==="PRODUCTION_MUTATION_BLOCKED");
});
