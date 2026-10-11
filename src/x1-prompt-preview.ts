/// <reference lib="dom" />
// X1 prompt-to-Vercel adapter. Reuse the EXISTING X1 queue, leases, and
// independent validator. No second scheduler. This handles static Vercel
// PREVIEW apps only, not production releases or general-purpose execution.
import {createHash} from "node:crypto";
import type {LeasedWork} from "./types.js";

const GITHUB_REPO="Strategic-Minds-AI/X1-OPERATING-SYSTEMS";
const GITHUB_API="https://api.github.com/repos/"+GITHUB_REPO;
const VERCEL_TEAM="team_aFdds8lsbHMwe2ip4aQdbQ3d";
const VERCEL_PROJECT="prj_JbkX4yKWygqBFRhkHL6nbeQXM46f";
const VERCEL_NAME="website-launch-engine";
const SOURCE_BRANCH="feature/x1-admin-gpt-command-sync-20261011";
const PREVIEW_HOST=/^website-launch-engine-[a-z0-9-]+\.vercel\.app$/;
const SHA=/^[a-f0-9]{40}$/;
const SHA256=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_KEYS=new Set(["kind","prompt","files","release_mode","synthetic","no_customer_data","no_spend","customer_outbound","domain_purchase","external_mutation"]);
const MAX_HTML_BYTES=160000;
const sha256=(s:string)=>createHash("sha256").update(s).digest("hex");
export const X1_PROMPT_PREVIEW_KIND="X1_PROMPT_TO_VERCEL_PREVIEW_V1";
export class PreviewGateError extends Error {constructor(code:string){super(code);}}

function gate(test:unknown,code:string):asserts test {
 if(!test)throw new PreviewGateError(code);
}
function safeJson(response:Response):Promise<any> {
 return response.json().catch(()=>{throw new PreviewGateError("PROVIDER_JSON_INVALID");});
}
export interface PreviewPack {
 workId:string; tenantId:string; missionId:string|null; prompt:string;
 html:string; sourceSha256:string; sourceBranch:string; sourcePath:string;
 vercelFiles:{file:string;data:string;encoding:"utf-8"}[];
}
export function compileX1PreviewPack(work:LeasedWork):PreviewPack {
 gate(work.action_class==="NON_PRODUCTION_MUTATION","X1_NONPRODUCTION_ACTION_REQUIRED");
 gate(UUID.test(work.tenant_id)&&UUID.test(work.work_id),"X1_IDENTITY_INVALID");
 gate(/^x1\.preview\.build\.[a-z0-9-]{6,72}$/.test(work.task_id),"X1_TASK_NOT_ALLOWED");
 gate(work.lease?.holderAgentId && work.lease.taskId===work.task_id,"X1_LEASE_CONTEXT_INVALID");
 gate(work.payload && typeof work.payload==="object" && !Array.isArray(work.payload),"X1_PAYLOAD_INVALID");
 const p=work.payload;
 gate(Object.keys(p).every(k=>ALLOWED_KEYS.has(k)),"X1_UNEXPECTED_PAYLOAD_FIELD");
 gate(p.kind===X1_PROMPT_PREVIEW_KIND,"X1_KIND_NOT_ALLOWED");
 gate(p.release_mode==="preview"&&p.synthetic===true&&p.no_customer_data===true&&
   p.no_spend===true&&p.customer_outbound===false&&p.domain_purchase===false&&
   p.external_mutation===true,"X1_PREVIEW_POLICY_FAILED");
 gate(typeof p.prompt==="string"&&p.prompt.length>=12&&p.prompt.length<=2400,"X1_PROMPT_INVALID");
 gate(Array.isArray(p.files)&&p.files.length===1,"X1_ONE_HTML_SOURCE_REQUIRED");
 const one=p.files[0] as {path?:unknown;content?:unknown};
 gate(one?.path==="index.html"&&typeof one.content==="string","X1_UNSUPPORTED_FILE_PATH");
 const html=one.content;
 gate(new TextEncoder().encode(html).byteLength>=1300&&
    new TextEncoder().encode(html).byteLength<=MAX_HTML_BYTES,"X1_HTML_SIZE_INVALID");
 gate(/^\s*<!doctype html>/i.test(html)&&/<html\b/i.test(html)&&/<main\b/i.test(html)&&
   /<title>[^<]+<\/title>/i.test(html)&&/<\/html>\s*$/i.test(html),"X1_HTML_DOCUMENT_INVALID");
 gate(/<meta\s+name=["']robots["']\s+content=["']noindex,nofollow["']/i.test(html),"X1_NOINDEX_REQUIRED");
 gate(/NOT A REAL BUSINESS/i.test(html),"X1_SYNTHETIC_DISCLOSURE_REQUIRED");
 gate(!/<script[^>]+\bsrc\s*=/i.test(html)&&!/https?:\/\/(?!images\.unsplash\.com)/i.test(
     html.replace(/https?:\/\/images\.unsplash\.com[^\s"'<>)]*/g,"")),"X1_EXTERNAL_NETWORK_DENIED");
 gate(!/<form\b/i.test(html)||/action=["']#["']/.test(html),"X1_FORM_MUST_BE_LOCAL_DEMO");
 gate(!/fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|localStorage|document\.cookie/i.test(html),
   "X1_UNAPPROVED_SIDE_EFFECT");
 const branch="feature/x1-output-"+work.work_id.toLowerCase();
 const path="generated-previews/"+work.work_id.toLowerCase()+"/index.html";
 const policies=JSON.stringify({version:2,headers:[{source:"/(.*)",headers:[
  {key:"X-Robots-Tag",value:"noindex, nofollow, noarchive"},
  {key:"Cache-Control",value:"private, no-store"}]}]},null,2);
 return Object.freeze({
  workId:work.work_id,tenantId:work.tenant_id,missionId:work.mission_id??null,
  prompt:p.prompt,html,sourceSha256:sha256(html),sourceBranch:branch,sourcePath:path,
  vercelFiles:[
   {file:"src/index.html",data:html,encoding:"utf-8" as const},
   {file:"src/vercel.json",data:policies,encoding:"utf-8" as const}
  ],
 });
}
export interface X1PreviewProvider {
 commitSource(pack:PreviewPack):Promise<{sha:string;url:string}>;
 deployPreview(pack:PreviewPack,sourceSha:string):Promise<{id:string;url:string;target:string|null;alias?:string[]}>;
 verifyDeployed(pack:PreviewPack,deployment:{id:string;url:string},sourceSha:string):Promise<void>;
}
export interface X1PreviewReceipt {
 kind:"X1_PROMPT_TO_VERCEL_PREVIEW_V1";
 status:"PREVIEW_BYTES_VERIFIED_PENDING_INDEPENDENT_BROWSER_QA";
 work_id:string;tenant_id:string;prompt_sha256:string;
 source_sha:string;source_url:string;source_branch:string;html_sha256:string;
 deployment_id:string;preview_url:string;release:"PREVIEW_ONLY";independent_qa:"PENDING";
}
export async function executeX1PromptPreview(work:LeasedWork,provider:X1PreviewProvider):Promise<X1PreviewReceipt>{
 const pack=compileX1PreviewPack(work);
 const source=await provider.commitSource(pack);
 gate(SHA.test(source?.sha??""),"X1_SOURCE_COMMIT_UNVERIFIED");
 gate(source.url.startsWith("https://github.com/"+GITHUB_REPO+"/"),"X1_SOURCE_REPO_MISMATCH");
 const deployment=await provider.deployPreview(pack,source.sha);
 gate(/^dpl_[a-zA-Z0-9]+$/.test(deployment?.id??""),"X1_DEPLOYMENT_ID_INVALID");
 gate(deployment.target===null&&!deployment.alias?.length,"X1_RELEASE_TARGET_DENIED");
 const location=new URL(deployment.url);
 gate(location.protocol==="https:"&&PREVIEW_HOST.test(location.hostname)&&
   location.pathname==="/"&&!location.search&&!location.hash,"X1_VERCEL_HOST_NOT_ALLOWED");
 await provider.verifyDeployed(pack,deployment,source.sha);
 return {
  kind:X1_PROMPT_PREVIEW_KIND,status:"PREVIEW_BYTES_VERIFIED_PENDING_INDEPENDENT_BROWSER_QA",
  work_id:pack.workId,tenant_id:pack.tenantId,prompt_sha256:sha256(pack.prompt),
  source_sha:source.sha,source_url:source.url,source_branch:pack.sourceBranch,
  html_sha256:pack.sourceSha256,deployment_id:deployment.id,
  preview_url:deployment.url,release:"PREVIEW_ONLY",independent_qa:"PENDING",
 };
}
export interface X1PreviewProviderConfig {
 githubToken:string;vercelToken:string;fetchImpl?:typeof fetch;
}
export function createX1PreviewHttpProvider(config:X1PreviewProviderConfig):X1PreviewProvider{
 gate(!!config.githubToken&&!!config.vercelToken,"X1_PREVIEW_PROVIDER_CREDENTIALS_REQUIRED");
 const fetchImpl=config.fetchImpl??fetch;
 async function api(url:string,token:string,method:string,body?:unknown):Promise<any>{
  let res:Response;
  try{res=await fetchImpl(url,{
   method,redirect:"error",signal:AbortSignal.timeout(12000),
   headers:{authorization:"Bearer "+token,accept:"application/json",
    ...(url.includes("api.github.com")?{"X-GitHub-Api-Version":"2022-11-28"}:{}),
    ...(body?{"content-type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  });}catch{throw new PreviewGateError("X1_PROVIDER_TIMEOUT_OR_NETWORK_ERROR");}
  gate(res.ok,"X1_PROVIDER_HTTP_"+res.status);
  return safeJson(res);
 }
 return {
  async commitSource(pack){
   // Use the original immutable source base; never push to main or another
   // existing X1 development branch. The per-job branch is created only once.
   const source=await api(GITHUB_API+"/git/ref/heads/"+SOURCE_BRANCH,config.githubToken,"GET");
   const parent=source?.object?.sha;
   gate(SHA.test(parent??""),"X1_SOURCE_BASE_UNVERIFIED");
   const commit=await api(GITHUB_API+"/git/commits/"+parent,config.githubToken,"GET");
   gate(SHA.test(commit?.tree?.sha??""),"X1_SOURCE_TREE_UNVERIFIED");
   const tree=await api(GITHUB_API+"/git/trees",config.githubToken,"POST",{
     base_tree:commit.tree.sha,tree:[{path:pack.sourcePath,mode:"100644",type:"blob",content:pack.html}]
   });
   gate(SHA.test(tree?.sha??""),"X1_NEW_TREE_UNVERIFIED");
   const newCommit=await api(GITHUB_API+"/git/commits",config.githubToken,"POST",{
    message:"feat(x1): generated noindex preview "+pack.workId,
    tree:tree.sha,parents:[parent]
   });
   gate(SHA.test(newCommit?.sha??""),"X1_NEW_COMMIT_UNVERIFIED");
   const branch=await api(GITHUB_API+"/git/refs",config.githubToken,"POST",{
     ref:"refs/heads/"+pack.sourceBranch,sha:newCommit.sha
   });
   gate(branch?.object?.sha===newCommit.sha,"X1_BRANCH_NOT_VERIFIED");
   return {sha:newCommit.sha,url:"https://github.com/"+GITHUB_REPO+"/tree/"+
     encodeURIComponent(pack.sourceBranch)+"/"+pack.sourcePath};
  },
  async deployPreview(pack,sourceSha){
   gate(SHA.test(sourceSha),"X1_DEPLOY_SOURCE_REQUIRED");
   const data=await api("https://api.vercel.com/v13/deployments?teamId="+VERCEL_TEAM,
     config.vercelToken,"POST",{
     project:VERCEL_PROJECT,name:VERCEL_NAME,files:pack.vercelFiles,
     meta:{x1Packet:pack.workId,x1SourceSha:sourceSha,
      x1HtmlHash:pack.sourceSha256,x1Release:"PREVIEW_ONLY"}
     // target and alias deliberately omitted: Vercel API creates Preview.
   });
   const d=data.deployment??data.result?.deployment??data;
   gate(typeof d.url==="string","X1_DEPLOYMENT_URL_MISSING");
   return {id:d.id,url:"https://"+d.url+"/",target:d.target??null,alias:d.alias??[]};
  },
  async verifyDeployed(pack,deployment){
   let ready=false;
   for(let attempt=0;attempt<9;attempt++){
    const d=await api("https://api.vercel.com/v13/deployments/"+deployment.id+
      "?teamId="+VERCEL_TEAM,config.vercelToken,"GET");
    const state=(d.deployment??d).readyState;
    if(state==="READY"){ready=true;break;}
    gate(!["ERROR","CANCELED","BLOCKED"].includes(state),"X1_DEPLOYMENT_FAILED");
    await new Promise(resolve=>setTimeout(resolve,1000));
   }
   gate(ready,"X1_DEPLOYMENT_NOT_READY_YET");
   let res:Response;
   try{res=await fetchImpl(deployment.url,{
    method:"GET",redirect:"error",signal:AbortSignal.timeout(12000),
    headers:{accept:"text/html"}
   });}catch{throw new PreviewGateError("X1_PREVIEW_FETCH_FAILED");}
   gate(res.ok,"X1_PREVIEW_HTTP_"+res.status);
   const body=await res.text();
   gate(body.startsWith(pack.html),"X1_PREVIEW_HTML_DRIFT");
   const suffix=body.slice(pack.html.length);
   const allowedToolbar='<script async data-explicit-opt-in="true" data-deployment-id="'+
      deployment.id+'" src="https://vercel.live/_next-live/feedback/feedback.js"></script>';
   gate(!suffix||suffix===allowedToolbar,"X1_UNEXPECTED_DEPLOYMENT_INJECTION");
   gate(sha256(body.slice(0,pack.html.length))===pack.sourceSha256,"X1_LIVE_SOURCE_HASH_MISMATCH");
   const robots=res.headers.get("x-robots-tag");
   gate(!robots||robots.includes("noindex"),"X1_LIVE_NOINDEX_MISSING");
  }
 };
}
