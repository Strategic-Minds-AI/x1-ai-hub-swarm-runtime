import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {compileX1PreviewPack,executeX1PromptPreview,createX1PreviewHttpProvider,X1_PROMPT_PREVIEW_KIND} from "../dist/x1-prompt-preview.js";
const WORK="33333333-3333-4333-8333-333333333333",TENANT="44444444-4444-4444-8444-444444444444";
const BASE="b".repeat(40),TREE="c".repeat(40),COMMIT="d".repeat(40),DEPLOY_ID="dpl_TestX1Preview1234";
const URL="https://website-launch-engine-x1proof1234-strategic-minds-advisory.vercel.app/";
const HTML=['<!doctype html><html lang="en"><head><meta name="robots" content="noindex,nofollow">',
'<title>X1 Proof App</title></head><body><header><h1>X1 Build Proof</h1></header><main>',
'<section><h2>Real application</h2><p>NOT A REAL BUSINESS. Synthetic noindex demonstration only.</p>',
'<p>Shows real source commits, remote deploy and independent validation, with no customer data.</p>',
'<button onclick="document.getElementById(\'c\').textContent=Number(document.getElementById(\'c\').textContent)+1">Test</button>',
'<output id="c">0</output></section><section><h2>Second section</h2>',
'<p>This is a nonproduction functional website from a bounded prompt-authoring packet.</p>',
'<p>There are no cross-tenant claims, paid inference, checkout functions, fake business credentials, or customer contact.</p>',
'<p>An immutable GitHub source SHA and Vercel preview deployment identify the exact delivered version.</p>',
'<p>Rollback remains an independent provider operation, never silently triggered by this renderer.</p>',
'<p>The command prompt acts as source context and is not treated as privileged code authorization.</p>',
'</section></main><footer>Strategic Minds AI · PREVIEW</footer></body></html>'].join("");
const sha=s=>createHash("sha256").update(s).digest("hex");
function work(other={}){
 return {work_id:WORK,tenant_id:TENANT,mission_id:"mission-test",task_id:"x1.preview.build.integration-test",
 work_packet_id:"WP-X1-PREVIEW-TEST",requested_by:"test",action_class:"NON_PRODUCTION_MUTATION",
 required_capabilities:[],source_sha:BASE,idempotency_key:"a".repeat(64),attempt:1,
 lease:{holderAgentId:"worker-1",taskId:"x1.preview.build.integration-test",
 leaseId:"lease-test-1",acquiredAt:new Date(Date.now()-5000).toISOString(),expiresAt:new Date(Date.now()+250000).toISOString()},
 payload:{kind:X1_PROMPT_PREVIEW_KIND,prompt:"Build a premium functional demonstration site",
 files:[{path:"index.html",content:HTML}],release_mode:"preview",synthetic:true,no_customer_data:true,
 no_spend:true,customer_outbound:false,domain_purchase:false,external_mutation:true},...other};
}
test("valid pack contains immutable code and only Vercel preview files",()=>{
 const p=compileX1PreviewPack(work());
 assert.equal(p.workId,WORK);
 assert.equal(p.sourceSha256,sha(HTML));
 assert.equal(p.sourcePath,"generated-previews/"+WORK+"/index.html");
 assert.deepEqual(p.vercelFiles.map(f=>f.file),["src/index.html","src/vercel.json"]);
 assert.match(p.vercelFiles[1].data,/noindex/);
});
test("invalid action, identity, lease and task fail closed",()=>{
 for(const k of [{action_class:"READ_ONLY"},{action_class:"PRODUCTION_RELEASE"},
  {tenant_id:"not-uuid"},{task_id:"x1.prod.build"},
  {lease:{holderAgentId:"worker",taskId:"not-same"}}]){
  assert.throws(()=>compileX1PreviewPack(work(k)));
 }
});
test("all safety gates reject protected release, real customers, payment and unknown keys",()=>{
 for(const [key,val] of [["release_mode","production"],["synthetic",false],
 ["no_customer_data",false],["no_spend",false],["customer_outbound",true],
 ["domain_purchase",true],["external_mutation",false]]){
  const w=work();w.payload[key]=val;
  assert.throws(()=>compileX1PreviewPack(w),/X1_PREVIEW_POLICY_FAILED/);
 }
 const w=work();w.payload.postToSocial=true;
 assert.throws(()=>compileX1PreviewPack(w),/X1_UNEXPECTED_PAYLOAD_FIELD/);
});
test("no unreviewed paths, scripts, forms, personal data or external requests",()=>{
 for(const html of [
 HTML.replace("noindex,nofollow","index,follow"),
 HTML.replace("NOT A REAL BUSINESS","Real licensed contractor"),
 HTML.replace("</head>",'<script src="https://cdn.evil.example/main.js"></script></head>'),
 HTML.replace("</main>",'<script>fetch("/api/private")</script></main>'),
 HTML.replace("</main>",'<form method="POST" action="https://evil.example/save"><input></form></main>'),
 HTML.replace("</main>",'<img src="https://evil.example/pixel"></main>')]){
  const w=work();w.payload.files=[{path:"index.html",content:html}];
  assert.throws(()=>compileX1PreviewPack(w));
 }
 const other=work();other.payload.files=[{path:"../../secrets",content:HTML}];
 assert.throws(()=>compileX1PreviewPack(other),/X1_UNSUPPORTED_FILE_PATH/);
});
test("delivery receipt is truthful: bytes verified but independent browser QA pending",async()=>{
 let validated=0;
 const provider={
  commitSource:async()=>({sha:COMMIT,url:"https://github.com/Strategic-Minds-AI/X1-OPERATING-SYSTEMS/commit/"+COMMIT}),
  deployPreview:async()=>({id:DEPLOY_ID,url:URL,target:null,alias:[]}),
  verifyDeployed:async()=>{validated++;}
 };
 const result=await executeX1PromptPreview(work(),provider);
 assert.equal(result.status,"PREVIEW_BYTES_VERIFIED_PENDING_INDEPENDENT_BROWSER_QA");
 assert.equal(result.release,"PREVIEW_ONLY");assert.equal(result.independent_qa,"PENDING");
 assert.equal(result.source_sha,COMMIT);assert.equal(result.html_sha256,sha(HTML));
 assert.equal(result.preview_url,URL);assert.equal(validated,1);
 await assert.rejects(()=>executeX1PromptPreview(work(),{
  ...provider,deployPreview:async()=>({id:DEPLOY_ID,url:URL,target:"production",alias:[]})
 }),/X1_RELEASE_TARGET_DENIED/);
 assert.equal(validated,1);
});
test("network provider commits exact source and deploys via existing GitHub/Vercel with no prod target",async()=>{
 const calls=[];
 const provider=createX1PreviewHttpProvider({githubToken:"test-gh",vercelToken:"test-vercel",
  fetchImpl:async(url,options)=>{
   calls.push({url,method:options.method,body:options.body?JSON.parse(options.body):null});
   const reply=(data,status=200,headers={})=>new Response(typeof data==="string"?data:JSON.stringify(data),{status,headers});
   if(url.endsWith("/git/ref/heads/feature/x1-admin-gpt-command-sync-20261011"))return reply({object:{sha:BASE}});
   if(url.endsWith("/git/commits/"+BASE))return reply({tree:{sha:"e".repeat(40)}});
   if(url.endsWith("/git/trees"))return reply({sha:TREE});
   if(url.endsWith("/git/commits"))return reply({sha:COMMIT});
   if(url.endsWith("/git/refs"))return reply({object:{sha:COMMIT}});
   if(url.includes("api.vercel.com/v13/deployments?"))return reply({deployment:{id:DEPLOY_ID,url:URL.replace("https://","").replace(/\/$/,""),target:null,alias:[]}});
   if(url.includes("/v13/deployments/"+DEPLOY_ID))return reply({deployment:{readyState:"READY"}});
   if(url===URL)return reply(HTML,200,{"x-robots-tag":"noindex,nofollow"});
   throw Error("Unexpected URL: "+url);
  }
 });
 const result=await executeX1PromptPreview(work(),provider);
 assert.equal(result.html_sha256,sha(HTML));
 assert.equal(calls.filter(c=>c.url.endsWith("/git/refs")&&c.method==="POST").length,1);
 assert.equal(calls.filter(c=>c.url.includes("/v13/deployments?")&&c.method==="POST").length,1);
 const deploy=calls.find(c=>c.url.includes("/v13/deployments?"));
 assert.deepEqual(deploy.body.files.map(f=>f.file),["src/index.html","src/vercel.json"]);
 assert.equal(Object.hasOwn(deploy.body,"target"),false);
 assert.equal(Object.hasOwn(deploy.body,"alias"),false);
 assert.equal(calls.some(c=>JSON.stringify(c.body??{}).includes("refs/heads/main")),false);
 assert.equal(JSON.stringify(result).includes("test-vercel"),false);
});
test("invalid GitHub source and missing provider keys fail closed",async()=>{
 assert.throws(()=>createX1PreviewHttpProvider({githubToken:"",vercelToken:""}),/X1_PREVIEW_PROVIDER_CREDENTIALS_REQUIRED/);
 const p=compileX1PreviewPack(work());
 const provider=createX1PreviewHttpProvider({githubToken:"g",vercelToken:"v",
  fetchImpl:async()=>new Response(JSON.stringify({object:{sha:"wrong"}}),{status:200})});
 await assert.rejects(()=>provider.commitSource(p),/X1_SOURCE_BASE_UNVERIFIED/);
});
test("browser validator failure prevents a success receipt",async()=>{
 await assert.rejects(()=>executeX1PromptPreview(work(),{
  commitSource:async()=>({sha:COMMIT,url:"https://github.com/Strategic-Minds-AI/X1-OPERATING-SYSTEMS/commit/"+COMMIT}),
  deployPreview:async()=>({id:DEPLOY_ID,url:URL,target:null}),
  verifyDeployed:async()=>{throw new Error("INDEPENDENT_VALIDATION_REQUIRED");}
 }),/INDEPENDENT_VALIDATION_REQUIRED/);
});
