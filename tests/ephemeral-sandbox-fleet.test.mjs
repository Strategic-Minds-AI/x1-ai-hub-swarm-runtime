import test from "node:test";
import assert from "node:assert/strict";
import {prepareWorkspace, assertSandboxOperation, advanceWorkspace, planExpiryCleanup, checkTenantConcurrency, SandboxGuardError} from "../dist/index.js";

const T1="00000000-0000-0000-0000-000000000001";
const T2="00000000-0000-0000-0000-000000000002";
const TIME=new Date("2026-10-11T04:00:00Z");
const request={tenantId:T1,clientSlug:"epoxy-demo",missionId:"mission_test_001",idempotencyKey:"synthetic-replay-safe-key-123",sourceSha:"a".repeat(40),ttlMinutes:30};
function fresh(opts={}){return prepareWorkspace({...request,...opts},TIME);}
function transition(w,nextState,extras={}){return advanceWorkspace(w,{eventId:"event_"+String(w.revision+1).padStart(8,"0"),expectedRevision:w.revision,nextState,...extras});}
function active(){return transition(transition(fresh(),"LEASED"),"BUILDING");}
function owned(w,overrides={}){return {provider:"vercel",externalId:"sbx_fake_only",ownerTag:w.ownerTag,resourceKey:w.resourcePrefix+"build/001",environment:"sandbox",...overrides};}
function actor(w,extras={}){return {verifiedByServer:true,approvedScope:"sandbox",tenantId:w.tenantId,...extras};}
function rejects(fn,code){assert.throws(fn,e=>e instanceof SandboxGuardError && e.code===code);}
test("same input makes deterministic sandbox id",()=>assert.equal(fresh().id,fresh().id));
test("different tenant produces different sandbox id",()=>assert.notEqual(fresh().id,fresh({tenantId:T2}).id));
test("scoped sandbox has 30 minute expiry and no spend by default",()=>{const w=fresh();assert.equal(w.expiresAt,"2026-10-11T04:30:00.000Z");assert.equal(w.budgetCents,0);assert.match(w.resourcePrefix,/^sandbox\/sbx-/);});
test("reject invalid tenant",()=>rejects(()=>fresh({tenantId:"not-a-uuid"}),"TENANT_ID_INVALID"));
test("reject path traversal in client slug",()=>rejects(()=>fresh({clientSlug:"../../prod"}),"CLIENT_SLUG_INVALID"));
test("reject missing source checksum",()=>rejects(()=>fresh({sourceSha:"main"}),"SOURCE_SHA_REQUIRED"));
test("reject unlimited sandbox TTL",()=>rejects(()=>fresh({ttlMinutes:5000}),"TTL_OUT_OF_BOUNDS"));
test("reject spend without explicit budget approval reference",()=>rejects(()=>fresh({budgetCents:1}),"BUDGET_APPROVAL_REQUIRED"));
test("accept bounded budget only with scoped approval reference",()=>assert.equal(fresh({budgetCents:10,budgetApprovalRef:"signed-approval-1"}).budgetCents,10));
test("can't execute when not leased",()=>{const w=fresh();rejects(()=>assertSandboxOperation(w,actor(w),"RUN_TESTS",owned(w),TIME),"WORKSPACE_NOT_MUTABLE");});
test("allow zero-cost owned sandbox test after lease",()=>{const w=active();assert.doesNotThrow(()=>assertSandboxOperation(w,actor(w),"RUN_TESTS",owned(w),TIME));});
test("reject cross tenant use",()=>{const w=active();rejects(()=>assertSandboxOperation(w,actor(w,{tenantId:T2}),"RUN_TESTS",owned(w),TIME),"CROSS_TENANT_DENIED");});
test("reject unverified user even if same tenant",()=>{const w=active();rejects(()=>assertSandboxOperation(w,actor(w,{verifiedByServer:false}),"RUN_TESTS",owned(w),TIME),"TRUSTED_SANDBOX_PRINCIPAL_REQUIRED");});
test("reject other sandbox resource",()=>{const w=active();rejects(()=>assertSandboxOperation(w,actor(w),"DELETE_OWNED_RESOURCE",owned(w,{ownerTag:"sandbox:someone-else"}),TIME),"RESOURCE_OWNERSHIP_MISMATCH");});
test("reject resource outside sandbox",()=>{const w=active();rejects(()=>assertSandboxOperation(w,actor(w),"DELETE_OWNED_RESOURCE",owned(w,{resourceKey:"production/customer/db"}),TIME),"RESOURCE_OUTSIDE_SANDBOX");});
test("reject production resource even with forged owner tag",()=>{const w=active();rejects(()=>assertSandboxOperation(w,actor(w),"RUN_TESTS",owned(w,{environment:"production"}),TIME),"PRODUCTION_MUTATION_BLOCKED");});
test("reject mutation after TTL expires",()=>{const w=active();rejects(()=>assertSandboxOperation(w,actor(w),"RUN_TESTS",owned(w),new Date("2026-10-11T05:00:00Z")),"SANDBOX_EXPIRED");});
test("reject actual consumption exceeding approved ceiling",()=>{const w=active();rejects(()=>assertSandboxOperation(w,actor(w),"PREVIEW_BUILD",owned(w),TIME,1),"BUDGET_EXCEEDED");});
test("reject forged protected action string at runtime",()=>{const w=active();rejects(()=>assertSandboxOperation(w,actor(w),"PROD_DEPLOY",owned(w),TIME),"ACTION_NOT_SANDBOX_ALLOWLISTED");});
test("replayed event is idempotent, returns original object",()=>{const w=fresh();const event={eventId:"event_00000001",expectedRevision:0,nextState:"LEASED"};const next=advanceWorkspace(w,event);assert.equal(advanceWorkspace(next,event),next);});
test("optimistic revision rejects stale competing mutation",()=>{const w=transition(fresh(),"LEASED");rejects(()=>advanceWorkspace(w,{eventId:"fresh_99999999",expectedRevision:0,nextState:"BUILDING"}),"STALE_WORKSPACE_REVISION");});
test("forbidden state transition fails closed",()=>rejects(()=>advanceWorkspace(fresh(),{eventId:"event_99999999",expectedRevision:0,nextState:"CLEANED"}),"ILLEGAL_STATE_TRANSITION"));
test("cannot archive without artifact verification",()=>{let w=active();w=transition(w,"TESTING");w=transition(w,"VERIFIED");rejects(()=>transition(w,"ARCHIVED"),"ARCHIVE_RECEIPT_REQUIRED");});
test("verified archive permits cleanup after TTL",()=>{let w=active();w=transition(w,"TESTING");w=transition(w,"VERIFIED");w=transition(w,"ARCHIVED",{archivesVerified:true});const plan=planExpiryCleanup(w,[owned(w)],new Date("2026-10-11T05:00:00Z"));assert.equal(plan.action,"SCHEDULE_OWNED_CLEANUP");assert.equal(plan.resources.length,1);assert.equal(transition(w,"CLEANED").state,"CLEANED");});
test("unknown resource quarantines entire cleanup plan",()=>{let w=active();w=transition(w,"TESTING");w=transition(w,"VERIFIED");w=transition(w,"ARCHIVED",{archivesVerified:true});const plan=planExpiryCleanup(w,[owned(w),owned(w,{resourceKey:"client/production/domain"})],new Date("2026-10-11T05:00:00Z"));assert.equal(plan.action,"QUARANTINE_FOR_EVIDENCE");assert.equal(plan.resources.length,0);});
test("nothing cleaned before deadline",()=>{const w=active();assert.equal(planExpiryCleanup(w,[],TIME).action,"NONE");});
test("expired unarchived sandbox quarantines rather than deletes",()=>{const w=active();assert.equal(planExpiryCleanup(w,[],new Date("2026-10-11T05:00:00Z")).action,"QUARANTINE_FOR_EVIDENCE");});
test("tenant concurrency enforced",()=>{const w=active();rejects(()=>checkTenantConcurrency([w,w,w],w.tenantId),"TENANT_CONCURRENCY_EXCEEDED");});
test("other-tenant load still counts toward global cap",()=>{const w=active();rejects(()=>checkTenantConcurrency(Array.from({length:20},(_,i)=>({...w,tenantId:"client-"+i})),T1),"GLOBAL_CONCURRENCY_EXCEEDED");});
test("limits do not count completed archived workspaces",()=>{const w=active();assert.doesNotThrow(()=>checkTenantConcurrency([{...w,state:"CLEANED"},{...w,state:"ARCHIVED"}],T1));});
