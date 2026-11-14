import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {EDEN_FACTORY_CANARY as F,normalizeCodingWorkPacket} from "../dist/coding-agent-contract.js";
import {applyAuthorizedBranchWrite} from "../dist/github-branch-writer.js";

const now=Date.now();
function canary() {
 return {
  work_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  tenant_id:F.tenant,mission_id:F.mission,task_id:F.task,
  work_packet_id:"WP-EDEN-FACTORY-CANARY-20261114",
  requested_by:"authorized-owner",action_class:"NON_PRODUCTION_MUTATION",
  required_capabilities:[{id:F.capability,mechanism:"policy"}],
  source_sha:F.sourceSha,idempotency_key:F.idempotencyKey,attempt:1,
  lease:{leaseId:"lease-eden-test",taskId:F.task,holderAgentId:F.worker,
   acquiredAt:new Date(now-2000).toISOString(),expiresAt:new Date(now+180000).toISOString()},
  payload:{kind:F.kind,repo:F.repo,branch:F.branch,
   objective:"Commit exactly one deterministic synthetic Node test on an isolated factory feature branch",
   allowed_paths:[F.path],validation:["unit"],synthetic:true,no_spend:true,
   no_customer_data:true,customer_outbound:false,production_release:false}
 };
}
test("exact factory canary compiles one zero-spend dry-run branch packet",()=>{
 const p=normalizeCodingWorkPacket(canary());
 assert.equal(p.repo,F.repo);assert.equal(p.branch,F.branch);
 assert.equal(p.sourceSha,F.sourceSha);assert.deepEqual(p.allowedPaths,[F.path]);
 assert.equal(p.dryRun,true);assert.equal(p.requireIndependentValidation,true);
 assert.equal(p.tenantId,F.tenant);
});
test("wrong tenant, mission, task, source, idempotency, lease and attempt fail closed",()=>{
 const edits=[
  w=>w.tenant_id="other",w=>w.mission_id="wrong",w=>w.task_id="other",
  w=>w.source_sha="f".repeat(40),w=>w.idempotency_key="f".repeat(64),
  w=>w.attempt=2,w=>w.lease.holderAgentId="other",w=>w.lease.taskId="other",
  w=>w.required_capabilities=[],w=>w.required_capabilities[0].mechanism="connector",
  w=>w.required_capabilities[0].id="connector:supabase"
 ];
 for(const edit of edits){const w=canary();edit(w);assert.throws(()=>normalizeCodingWorkPacket(w));}
});
test("wrong repository, branch, paths, validations and all broadened effects fail closed",()=>{
 const edits=[
  w=>w.payload.repo="Strategic-Minds-AI/X1-OPERATING-SYSTEM",
  w=>w.payload.branch="feature/other",w=>w.payload.branch="main",
  w=>w.payload.allowed_paths=["src/worker-main-gateway.ts"],
  w=>w.payload.allowed_paths=[F.path,"tests/other.test.mjs"],
  w=>w.payload.validation=["unit","deploy"],
  w=>w.payload.synthetic=false,w=>w.payload.no_spend=false,
  w=>w.payload.no_customer_data=false,w=>w.payload.customer_outbound=true,
  w=>w.payload.production_release=true,w=>w.payload.extra="unexpected",
  w=>w.payload.budget_usd=1,w=>w.payload.deploy=true,
  w=>w.action_class="READ_ONLY",w=>w.approval_reference="fake"
 ];
 for(const edit of edits){const w=canary();edit(w);assert.throws(()=>normalizeCodingWorkPacket(w));}
});
test("ordinary X1 coding contracts are unchanged and cannot impersonate factory kind",()=>{
 const w=canary();w.payload.kind="X1_CODING_AGENT_V1";
 assert.throws(()=>normalizeCodingWorkPacket(w),/KIND_REPO_MISMATCH/);
 w.payload.repo="Strategic-Minds-AI/X1-OPERATING-SYSTEM";
 const p=normalizeCodingWorkPacket(w);
 assert.equal(p.repo,"Strategic-Minds-AI/X1-OPERATING-SYSTEM");
});
test("factory GitHub write requires real signed grant and default-off writer",async()=>{
 const packet=normalizeCodingWorkPacket(canary());
 const proposal={summary:"single fixed Node canary",changes:[{path:F.path,
  content:"import test from 'node:test';\\nimport assert from 'node:assert/strict';\\ntest('canary',()=>assert.equal(2+2,4));\\n",
  explanation:"synthetic isolated unit test"}]};
 const grant={grantId:"canary-grant-test",action:"BRANCH_WRITE",tenantId:F.tenant,
  packetId:packet.packetId,repo:F.repo,branch:F.branch,expectedSha:F.sourceSha,
  expiresAt:new Date(Date.now()+60000).toISOString(),allowedPaths:[F.path],signature:"0".repeat(64)};
 let calls=0;const fetchImpl=async()=>{calls++;throw Error("NETWORK_MUST_NOT_BE_USED");};
 await assert.rejects(()=>applyAuthorizedBranchWrite(packet,proposal,grant,
  {enabled:false,githubToken:"fixture",grantSigningKey:"fixture",fetchImpl}),/WRITER_DISABLED/);
 await assert.rejects(()=>applyAuthorizedBranchWrite(packet,proposal,grant,
  {enabled:true,githubToken:"fixture",grantSigningKey:"fixture",fetchImpl}),/SIGNATURE_INVALID/);
 assert.equal(calls,0);
});
test("signed grant pins a single existing factory branch and GitHub CAS writer",async()=>{
 const packet=normalizeCodingWorkPacket(canary()),tree="b".repeat(40),commit="c".repeat(40);
 const proposal={summary:"single canary",changes:[{path:F.path,
  content:"export const canary = true;\\n",explanation:"fixture"}]};
 const grant={grantId:"canary-grant-test",action:"BRANCH_WRITE",tenantId:F.tenant,
  packetId:packet.packetId,repo:F.repo,branch:F.branch,expectedSha:F.sourceSha,
  expiresAt:new Date(Date.now()+60000).toISOString(),allowedPaths:[F.path]};
 const key="isolated-unit-signing-key";
 const message=JSON.stringify([grant.grantId,grant.action,grant.tenantId,grant.packetId,
  grant.repo,grant.branch,grant.expectedSha,grant.expiresAt,grant.allowedPaths]);
 const signed={...grant,signature:createHmac("sha256",key).update(message).digest("hex")};
 const calls=[];
 const reply=data=>new Response(JSON.stringify(data),{status:200,headers:{"content-type":"application/json"}});
 const fetchImpl=async(url,opt)=>{
  calls.push({url,method:opt.method,body:opt.body?JSON.parse(opt.body):null});
  if(url.endsWith("/git/ref/heads/"+F.branch))return reply({object:{sha:F.sourceSha}});
  if(url.endsWith("/git/commits/"+F.sourceSha))return reply({tree:{sha:tree}});
  if(url.endsWith("/git/trees"))return reply({sha:tree});
  if(url.endsWith("/git/commits"))return reply({sha:commit});
  if(url.endsWith("/git/refs/heads/"+F.branch))return reply({object:{sha:commit}});
  throw Error("unexpected provider URL "+url);
 };
 const result=await applyAuthorizedBranchWrite(packet,proposal,signed,
  {enabled:true,githubToken:"fixture-not-real",grantSigningKey:key,fetchImpl});
 assert.equal(result.commitSha,commit);assert.equal(result.repo,F.repo);
 assert.deepEqual(result.candidatePaths,[F.path]);
 assert.equal(calls.length,5);
 assert.equal(calls.some(c=>/refs\/heads\/main/.test(c.url)),false);
 assert.equal(calls.some(c=>c.url.includes("vercel")),false);
 assert.equal(calls.filter(c=>c.method==="PATCH").length,1);
 assert.equal(calls[4].body.force,false);
});
