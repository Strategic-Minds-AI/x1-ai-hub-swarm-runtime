import { createHmac, timingSafeEqual } from "node:crypto";
import type { SafeCodingDispatch } from "./coding-agent-contract.js";
import type { Proposal } from "./autobuild-pipeline.js";

/** A *different* authorized control-plane actor mints this signed grant. */
export interface BranchWriteGrant {
 grantId:string; action:"BRANCH_WRITE"; tenantId:string; packetId:string;
 repo:string; branch:string; expectedSha:string; expiresAt:string;
 allowedPaths:string[];
 signature:string;
}
export interface BranchWriterConfig {
 enabled?:boolean;
 githubToken?:string;
 grantSigningKey?:string;
 fetchImpl?:typeof fetch;
}
function signable(grant:BranchWriteGrant):string {
 return JSON.stringify([grant.grantId,grant.action,grant.tenantId,grant.packetId,
  grant.repo,grant.branch,grant.expectedSha,grant.expiresAt,grant.allowedPaths]);
}
function equalHex(a:string,b:string):boolean {
 if(!/^[0-9a-f]{64}$/i.test(a)||!/^[0-9a-f]{64}$/i.test(b))return false;
 const x=new Uint8Array(a.match(/.{2}/g)!.map(v=>parseInt(v,16)));
 const y=new Uint8Array(b.match(/.{2}/g)!.map(v=>parseInt(v,16)));
 return timingSafeEqual(x,y);
}
function assertValidGrant(packet:SafeCodingDispatch,grant:BranchWriteGrant,key:string):void {
 if(grant.action!=="BRANCH_WRITE"||!grant.grantId||!key)throw new Error("X1_BRANCH_GRANT_REQUIRED");
 if(grant.tenantId!==packet.tenantId||grant.packetId!==packet.packetId||
    grant.repo!==packet.repo||grant.branch!==packet.branch||
    grant.expectedSha!==packet.sourceSha)throw new Error("X1_BRANCH_GRANT_SCOPE_MISMATCH");
 if(!Number.isFinite(Date.parse(grant.expiresAt))||Date.parse(grant.expiresAt)<=Date.now())throw new Error("X1_BRANCH_GRANT_EXPIRED");
 if(grant.allowedPaths.length!==packet.allowedPaths.length ||
    !grant.allowedPaths.every((p,i)=>p===packet.allowedPaths[i]))throw new Error("X1_BRANCH_GRANT_PATHS_MISMATCH");
 const digest=createHmac("sha256",key).update(signable(grant)).digest("hex");
 if(!equalHex(digest,grant.signature))throw new Error("X1_BRANCH_GRANT_SIGNATURE_INVALID");
}
function assertProposal(packet:SafeCodingDispatch,proposal:Proposal):void {
 if(!Array.isArray(proposal.changes)||proposal.changes.length<1||proposal.changes.length>15)throw new Error("X1_BRANCH_CHANGES_INVALID");
 const seen=new Set<string>();
 for(const edit of proposal.changes){
  if(!packet.allowedPaths.includes(edit.path)||seen.has(edit.path)||!edit.content||edit.content.length>150000||
    edit.path.includes("..")||edit.path.includes("\\")||! /^(src|docs|tests)\//.test(edit.path))
    throw new Error("X1_BRANCH_PATH_OR_SIZE_INVALID");
  seen.add(edit.path);
 }
}
export interface BranchWriteReceipt {
 repo:string;branch:string;baseSha:string;commitSha:string;grantId:string;candidatePaths:string[];
}
export async function applyAuthorizedBranchWrite(
 packet:SafeCodingDispatch,proposal:Proposal,grant:BranchWriteGrant,config:BranchWriterConfig,
):Promise<BranchWriteReceipt> {
 if(config.enabled!==true||!config.githubToken||!config.grantSigningKey)throw new Error("X1_BRANCH_WRITER_DISABLED");
 // The authorizing controller, not the model, upgrades a dry-run proposal to
 // a scoped BRANCH_WRITE grant, verified here before a network mutation.
 assertValidGrant(packet,grant,config.grantSigningKey);
 assertProposal(packet,proposal);
 const f=config.fetchImpl??fetch;
 const api="https://api.github.com/repos/"+packet.repo;
 async function call(path:string,method:"GET"|"POST"|"PATCH",body?:unknown):Promise<Record<string,any>> {
  const res=await f(api+path,{
   method,headers:{"Accept":"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28","Authorization":"Bearer "+config.githubToken,
    "Content-Type":"application/json"},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30_000),
  });
  if(!res.ok)throw new Error("X1_BRANCH_GITHUB_API_FAILED");
  const data=await res.json();
  if(!data||typeof data!=="object")throw new Error("X1_BRANCH_GITHUB_RESPONSE_INVALID");
  return data as Record<string,any>;
 }
 const ref="/git/ref/heads/"+packet.branch;
 const current=await call(ref,"GET");
 if(current.object?.sha!==packet.sourceSha)throw new Error("X1_BRANCH_SOURCE_SHA_DRIFT");
 const parent=await call("/git/commits/"+packet.sourceSha,"GET");
 const baseTree=parent.tree?.sha;
 if(!/^[a-f0-9]{40}$/.test(baseTree??""))throw new Error("X1_BRANCH_TREE_MISSING");
 const tree=await call("/git/trees","POST",{
  base_tree:baseTree,
  tree:proposal.changes.map(e=>({path:e.path,mode:"100644",type:"blob",content:e.content})),
 });
 if(!/^[a-f0-9]{40}$/.test(tree.sha??""))throw new Error("X1_BRANCH_NEW_TREE_INVALID");
 const commit=await call("/git/commits","POST",{
  message:"chore(x1-auto): scoped packet "+packet.packetId,
  tree:tree.sha,parents:[packet.sourceSha],
 });
 if(!/^[a-f0-9]{40}$/.test(commit.sha??""))throw new Error("X1_BRANCH_NEW_COMMIT_INVALID");
 const updated=await call("/git/refs/heads/"+packet.branch,"PATCH",{sha:commit.sha,force:false});
 if(updated.object?.sha!==commit.sha)throw new Error("X1_BRANCH_REF_NOT_CONFIRMED");
 return {repo:packet.repo,branch:packet.branch,baseSha:packet.sourceSha,
  commitSha:commit.sha,grantId:grant.grantId,candidatePaths:proposal.changes.map(x=>x.path)};
}
