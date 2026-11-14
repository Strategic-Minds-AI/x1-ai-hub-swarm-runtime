// ONE synthetic Eden Factory task inside the existing X1 worker's already
// authenticated queue/lease/ledger path. NOT wired to a runtime or enabled.
import {verify as verifySignature} from "node:crypto";
import {EDEN_FACTORY_CANARY as F,normalizeCodingWorkPacket} from "./coding-agent-contract.js";
import {applyAuthorizedBranchWrite,type BranchWriteGrant,type BranchWriteReceipt,type BranchWriterConfig} from "./github-branch-writer.js";
import type {Proposal} from "./autobuild-pipeline.js";
import type {LeasedWork} from "./types.js";

export interface AtomicAdmission {
  granted:boolean; tenantId:string; missionId:string; taskId:string;
  workId:string; leaseId:string; sourceSha:string; idempotencyKey:string;
  issuedAt:string; expiresAt:string; receiptId:string;
}
export interface IndependentCheck {
  status:"PASS"|"FAIL"|"UNKNOWN"; actorId:string; receiptId:string;
  commitSha:string; workId:string; leaseId:string; artifactUri:string;
  independentlyAuthenticated:boolean; issuedAt:string; signatureHex:string;
}
export interface CanaryRecord {
  workId:string; leaseId:string; commitSha:string; branch:string;
  qaReceiptId:string; guardianReceiptId:string; persistenceReceiptId:string;
}
export interface EdenFactoryCodeworkerConfig {
  enabled?:boolean;
  environment:"development"|"preview"|"production";
  workerId:string;
  tenantId:string;
  writer:BranchWriterConfig;
  qaPublicKey:string;
  guardianPublicKey:string;
  // All callbacks MUST be provider-native authenticated server-side methods,
  // never passed through an MCP request, model output, or browser.
  verifyAtomicAdmission:(work:LeasedWork)=>Promise<AtomicAdmission>;
  issueSignedGrant:(work:LeasedWork,proposal:Proposal,admission:AtomicAdmission)=>Promise<BranchWriteGrant>;
  independentQa:(work:LeasedWork,commit:BranchWriteReceipt)=>Promise<IndependentCheck>;
  guardian:(work:LeasedWork,commit:BranchWriteReceipt)=>Promise<IndependentCheck>;
  persistAndReadback:(work:LeasedWork,commit:BranchWriteReceipt,qa:IndependentCheck,guardian:IndependentCheck)=>Promise<CanaryRecord>;
  now?:()=>number;
}

export const EDEN_CANARY_PROPOSAL:Proposal=Object.freeze({
  summary:"Exactly one original synthetic Node test, no production changes",
  changes:[Object.freeze({
    path:F.path,
    content:"import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('X1 factory synthetic canary',()=>{assert.equal(7*6,42);});\n",
    explanation:"Stable reviewable test fixture; no dynamic prompts, package installs or network access",
  })],
});

function assertAdmission(a:AtomicAdmission,w:LeasedWork,now:number):void {
 if(a.granted!==true || a.tenantId!==F.tenant || a.missionId!==F.mission ||
   a.taskId!==F.task || a.workId!==w.work_id || a.leaseId!==w.lease?.leaseId ||
   a.sourceSha!==F.sourceSha || a.idempotencyKey!==F.idempotencyKey ||
   !a.receiptId || !Number.isFinite(Date.parse(a.issuedAt)) ||
   !Number.isFinite(Date.parse(a.expiresAt)) ||
   Date.parse(a.issuedAt)>now || Date.parse(a.expiresAt)<=now+30000 ||
   Date.parse(a.expiresAt)-Date.parse(a.issuedAt)>10*60*1000)
  throw new Error("X1_FACTORY_ATOMIC_ADMISSION_REQUIRED");
}
function assertIndependent(p:IndependentCheck,w:LeasedWork,r:BranchWriteReceipt,kind:string,
 publicKey:string,now:number):void {
 if(p.status!=="PASS" || p.independentlyAuthenticated!==true ||
   !p.actorId || p.actorId===F.worker || !p.receiptId || !p.artifactUri ||
   p.commitSha!==r.commitSha || p.workId!==w.work_id ||
   p.leaseId!==w.lease?.leaseId ||
   !/^https:\/\/[^\s]+$/.test(p.artifactUri) ||
   !Number.isFinite(Date.parse(p.issuedAt)) ||
   Date.parse(p.issuedAt)>now+60000 || now-Date.parse(p.issuedAt)>10*60000 ||
   !/^[0-9a-f]{128}$/i.test(p.signatureHex) ||
   !publicKey.includes("BEGIN PUBLIC KEY"))
  throw new Error("X1_FACTORY_"+kind+"_PROOF_REQUIRED");
 const signed=JSON.stringify([p.status,p.actorId,p.receiptId,p.commitSha,
   p.workId,p.leaseId,p.artifactUri,p.issuedAt]);
 const bytes=new Uint8Array((p.signatureHex.match(/.{2}/g)||[]).map(x=>parseInt(x,16)));
 if(!verifySignature(null,new TextEncoder().encode(signed),publicKey,bytes))
  throw new Error("X1_FACTORY_"+kind+"_SIGNATURE_INVALID");
}
export function createEdenFactoryCodeworker(config:EdenFactoryCodeworkerConfig) {
 return async (work:LeasedWork) => {
  if(config.enabled!==true || config.environment!=="preview" ||
     config.workerId!==F.worker || config.tenantId!==F.tenant ||
     config.writer.enabled!==true ||
     !config.qaPublicKey || !config.guardianPublicKey ||
     config.qaPublicKey===config.guardianPublicKey)
    throw new Error("X1_FACTORY_CODEWORKER_DISABLED");
  if(work.payload?.kind!==F.kind)throw new Error("X1_FACTORY_CANARY_KIND_REQUIRED");
  const p=normalizeCodingWorkPacket(work);
  if(p.repo!==F.repo || p.branch!==F.branch || p.sourceSha!==F.sourceSha ||
     p.allowedPaths.length!==1 || p.allowedPaths[0]!==F.path ||
     work.lease?.holderAgentId!==F.worker)
    throw new Error("X1_FACTORY_CANARY_SCOPE_MISMATCH");
  const now=(config.now??Date.now)();
  const admission=await config.verifyAtomicAdmission(work);
  assertAdmission(admission,work,now);
  // The controller must sign the one-branch grant AFTER atomically proving the
  // same lease at write time. The existing GitHub writer verifies its signature.
  const grant=await config.issueSignedGrant(work,EDEN_CANARY_PROPOSAL,admission);
  let commit:BranchWriteReceipt;
  try {
   commit=await applyAuthorizedBranchWrite(p,EDEN_CANARY_PROPOSAL,grant,config.writer);
  } catch {
   // The GitHub request may have committed before a timeout. Do not retry
   // a potentially successful write under another lease.
   throw new Error("EXECUTION_COMPLETION_UNCONFIRMED");
  }
  try {
   if(commit.repo!==F.repo || commit.branch!==F.branch ||
      commit.baseSha!==F.sourceSha || !/^[a-f0-9]{40}$/.test(commit.commitSha))
    throw new Error("X1_FACTORY_COMMIT_READBACK_MISMATCH");
   const qa=await config.independentQa(work,commit);
   assertIndependent(qa,work,commit,"QA",config.qaPublicKey,(config.now??Date.now)());
   const guardian=await config.guardian(work,commit);
   assertIndependent(guardian,work,commit,"GUARDIAN",config.guardianPublicKey,(config.now??Date.now)());
   if(guardian.actorId===qa.actorId)
    throw new Error("X1_FACTORY_INDEPENDENT_ROLE_SEPARATION_REQUIRED");
   const persisted=await config.persistAndReadback(work,commit,qa,guardian);
   if(persisted.workId!==work.work_id ||
      persisted.leaseId!==work.lease.leaseId ||
      persisted.commitSha!==commit.commitSha ||
      persisted.branch!==F.branch ||
      persisted.qaReceiptId!==qa.receiptId ||
      persisted.guardianReceiptId!==guardian.receiptId ||
      !persisted.persistenceReceiptId)
    throw new Error("X1_FACTORY_DURABLE_READBACK_MISMATCH");
   return {status:"CANARY_QA_GUARDIAN_RECEIPTS_READ_BACK",repo:F.repo,
      commitSha:commit.commitSha,workId:work.work_id,
      qaReceiptId:qa.receiptId,guardianReceiptId:guardian.receiptId,
      persistenceReceiptId:persisted.persistenceReceiptId,
      productionReleased:false,additionalSpendUsd:0};
  } catch {
   // Never make the outer orchestrator mark queue COMPLETED when an effect
   // occurred but independent verification or receipt persistence is missing.
   throw new Error("EXECUTION_COMPLETION_UNCONFIRMED");
  }
 };
}
