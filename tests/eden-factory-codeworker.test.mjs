import {test} from "node:test";
import assert from "node:assert/strict";
import {createHmac,generateKeyPairSync,sign} from "node:crypto";
import {EDEN_FACTORY_CANARY as F} from "../dist/coding-agent-contract.js";
import {createEdenFactoryCodeworker} from "../dist/eden-factory-codeworker.js";

const now=Date.now(),tree="e".repeat(40),commit="c".repeat(40);
const QA_KEYS=generateKeyPairSync("ed25519");
const GUARDIAN_KEYS=generateKeyPairSync("ed25519");
function signedCheck(w,actorId,receiptId,artifactUri,keys){
 const p={status:"PASS",actorId,receiptId,commitSha:commit,workId:w.work_id,
  leaseId:w.lease.leaseId,artifactUri,independentlyAuthenticated:true,
  issuedAt:new Date(now).toISOString()};
 const msg=JSON.stringify([p.status,p.actorId,p.receiptId,p.commitSha,
   p.workId,p.leaseId,p.artifactUri,p.issuedAt]);
 return {...p,signatureHex:sign(null,Buffer.from(msg),keys.privateKey).toString("hex")};
}
function work(){
 return {work_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  tenant_id:F.tenant,mission_id:F.mission,task_id:F.task,
  work_packet_id:"WP-EDEN-FACTORY-CANARY-20261114",
  requested_by:"operator",action_class:"NON_PRODUCTION_MUTATION",
  required_capabilities:[{id:F.capability,mechanism:"policy"}],
  source_sha:F.sourceSha,idempotency_key:F.idempotencyKey,attempt:1,
  lease:{leaseId:"lease-eden",taskId:F.task,holderAgentId:F.worker,
   acquiredAt:new Date(now-5000).toISOString(),
   expiresAt:new Date(now+240000).toISOString()},
  payload:{kind:F.kind,repo:F.repo,branch:F.branch,
   objective:"One fixed original synthetic test",allowed_paths:[F.path],
   validation:["unit"],synthetic:true,no_spend:true,no_customer_data:true,
   customer_outbound:false,production_release:false}};
}
function setup(changes={}){
 let network=0, admission=0, reviews=0;
 const fetchImpl=async (url,opt)=>{
  network++;
  const reply=d=>new Response(JSON.stringify(d),{status:200});
  if(url.endsWith("/git/ref/heads/"+F.branch))return reply({object:{sha:F.sourceSha}});
  if(url.endsWith("/git/commits/"+F.sourceSha))return reply({tree:{sha:tree}});
  if(url.endsWith("/git/trees"))return reply({sha:tree});
  if(url.endsWith("/git/commits"))return reply({sha:commit});
  if(url.endsWith("/git/refs/heads/"+F.branch)){
   assert.equal(JSON.parse(opt.body).force,false);
   return reply({object:{sha:commit}});
  }
  throw new Error("Unexpected GitHub endpoint "+url);
 };
 const cfg={
  enabled:true,environment:"preview",workerId:F.worker,tenantId:F.tenant,
  writer:{enabled:true,githubToken:"mock-token",grantSigningKey:"mock-sign-key",fetchImpl},
  qaPublicKey:QA_KEYS.publicKey.export({type:"spki",format:"pem"}),
  guardianPublicKey:GUARDIAN_KEYS.publicKey.export({type:"spki",format:"pem"}),
  now:()=>now,
  verifyAtomicAdmission:async w=>{
   admission++;
   return {granted:true,tenantId:F.tenant,missionId:F.mission,taskId:F.task,
    workId:w.work_id,leaseId:w.lease.leaseId,sourceSha:F.sourceSha,
    idempotencyKey:F.idempotencyKey,receiptId:"provider-cas-001",
    issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+180000).toISOString()};
  },
  issueSignedGrant:async(w,proposal,a)=>{
   assert.equal(a.receiptId,"provider-cas-001");
   assert.deepEqual(proposal.changes.map(x=>x.path),[F.path]);
   const grant={grantId:"grant-eden-001",action:"BRANCH_WRITE",tenantId:F.tenant,
    packetId:w.work_packet_id,repo:F.repo,branch:F.branch,expectedSha:F.sourceSha,
    expiresAt:new Date(now+180000).toISOString(),allowedPaths:[F.path]};
   const msg=JSON.stringify([grant.grantId,grant.action,grant.tenantId,grant.packetId,
    grant.repo,grant.branch,grant.expectedSha,grant.expiresAt,grant.allowedPaths]);
   return {...grant,signature:createHmac("sha256","mock-sign-key").update(msg).digest("hex")};
  },
  independentQa:async w=>{reviews++;return signedCheck(w,"separate-qa",
    "qa-receipt-001","https://example.invalid/qa",QA_KEYS);},
  guardian:async w=>{reviews++;return signedCheck(w,"separate-guardian",
    "guardian-receipt-001","https://example.invalid/guardian",GUARDIAN_KEYS);},
  persistAndReadback:async w=>({
    workId:w.work_id,leaseId:w.lease.leaseId,commitSha:commit,branch:F.branch,
    qaReceiptId:"qa-receipt-001",guardianReceiptId:"guardian-receipt-001",
    persistenceReceiptId:"receipt-in-x1-001"}),
  ...changes,
 };
 return {cfg,counts:()=>({network,admission,reviews})};
}
test("disabled and production handler cannot ask X1 or write GitHub",async()=>{
 for(const patch of [{enabled:false},{environment:"production"},{workerId:"other-worker"}]){
  const s=setup(patch);
  await assert.rejects(createEdenFactoryCodeworker(s.cfg)(work()),/CODEWORKER_DISABLED/);
  assert.deepEqual(s.counts(),{network:0,admission:0,reviews:0});
 }
});
test("wrong tenant, kind, branch, source and worker lease fail before provider IO",async()=>{
 const edits=[w=>w.tenant_id="other",w=>w.source_sha="f".repeat(40),
 w=>w.payload.branch="feature/wrong",w=>w.payload.kind="X1_CODING_AGENT_V1",
 w=>w.lease.holderAgentId="other"];
 for(const change of edits){
  const s=setup(),w=work();change(w);
  await assert.rejects(createEdenFactoryCodeworker(s.cfg)(w));
  assert.deepEqual(s.counts(),{network:0,admission:0,reviews:0});
 }
});
test("no provider atomic admission means no GitHub side effect",async()=>{
 const s=setup({verifyAtomicAdmission:async w=>({
  granted:false,tenantId:F.tenant,missionId:F.mission,taskId:F.task,
  workId:w.work_id,leaseId:w.lease.leaseId,sourceSha:F.sourceSha,
  idempotencyKey:F.idempotencyKey,receiptId:"fake",
  issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString()
 })});
 await assert.rejects(createEdenFactoryCodeworker(s.cfg)(work()),/ATOMIC_ADMISSION_REQUIRED/);
 assert.equal(s.counts().network,0);
});
test("one signed branch write and both independent receipts produce verified canary receipt in mock provider",async()=>{
 const s=setup(),result=await createEdenFactoryCodeworker(s.cfg)(work());
 assert.equal(result.status,"CANARY_QA_GUARDIAN_RECEIPTS_READ_BACK");
 assert.equal(result.commitSha,commit);assert.equal(result.productionReleased,false);
 assert.equal(result.additionalSpendUsd,0);
 assert.equal(s.counts().network,5);assert.equal(s.counts().admission,1);
 assert.equal(s.counts().reviews,2);
});
test("bad branch grant prevents all network side effects",async()=>{
 const s=setup({issueSignedGrant:async()=>({
  grantId:"x",action:"BRANCH_WRITE",tenantId:F.tenant,packetId:"bad",
  repo:F.repo,branch:F.branch,expectedSha:F.sourceSha,
  expiresAt:new Date(now+60000).toISOString(),allowedPaths:[F.path],
  signature:"a".repeat(64)})});
 await assert.rejects(createEdenFactoryCodeworker(s.cfg)(work()),/COMPLETION_UNCONFIRMED/);
 assert.equal(s.counts().network,0);
});
test("postcommit independent QA or Guardian failure never returns completed",async()=>{
 for(const field of ["independentQa","guardian"]){
  const s=setup({[field]:async w=>({
   status:"UNKNOWN",actorId:"unverified",receiptId:"none",commitSha:commit,
   workId:w.work_id,leaseId:w.lease.leaseId,artifactUri:"none",
   independentlyAuthenticated:false,issuedAt:new Date(now).toISOString(),
   signatureHex:"a".repeat(128)})});
  await assert.rejects(createEdenFactoryCodeworker(s.cfg)(work()),/COMPLETION_UNCONFIRMED/);
  assert.equal(s.counts().network,5);
 }
});
test("durable readback mismatch after GitHub write quarantines instead of success",async()=>{
 const s=setup({persistAndReadback:async w=>({
  workId:w.work_id,leaseId:w.lease.leaseId,commitSha:commit,
  branch:F.branch,qaReceiptId:"wrong",
  guardianReceiptId:"guardian-receipt-001",persistenceReceiptId:"receipt"})});
 await assert.rejects(createEdenFactoryCodeworker(s.cfg)(work()),/COMPLETION_UNCONFIRMED/);
 assert.equal(s.counts().network,5);
});

test("tampered signed QA receipt cannot produce a success receipt",async()=>{
 const s=setup({independentQa:async w=>{
  const signed=signedCheck(w,"separate-qa","qa-receipt-001","https://example.invalid/qa",QA_KEYS);
  return {...signed,receiptId:"tampered-receipt"};
 }});
 await assert.rejects(createEdenFactoryCodeworker(s.cfg)(work()),/COMPLETION_UNCONFIRMED/);
 assert.equal(s.counts().network,5);
});
test("same QA and Guardian signing keys are rejected before any effect",async()=>{
 const s=setup({guardianPublicKey:QA_KEYS.publicKey.export({type:"spki",format:"pem"})});
 await assert.rejects(createEdenFactoryCodeworker(s.cfg)(work()),/CODEWORKER_DISABLED/);
 assert.equal(s.counts().network,0);
});
