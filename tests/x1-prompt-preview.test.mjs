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
'<p>Validation must include meaningful browser interactions, responsive geometry, correct link behavior, and a real reachable preview. The approved external provider may create an isolated deployment only after source revision identity is independently established.</p>',
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
  assert.match(p.vercelFiles[1].data,/"Cache-Control"/);
  assert.match(p.vercelFiles[1].data,/private, no-store/);
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
test("synthetic preview denies all forms and submit overrides, including misleading safe targets",()=>{
 const variants=[
  '<form action="#" method="get"><input></form>',
  '<form method="get" action="#"><input></form><form action="/relative"><input></form>',
  '<form action="#"><button>Local demo</button></form><form action="https://evil.example/save"><button>Other</button></form>',
  '<form method="POST" action="#"><input name="message"></form>',
  '<form action="#"><button formaction="/receive" type="submit">Submit</button></form>',
  '<form action="#"><input type="submit" formaction="/receive"></form>',
  '<button formmethod="post">Override</button>',
  '<button formtarget="_blank">New window</button>',
  '<input formenctype="multipart/form-data">',
  '<FORM ACTION="#">Mixed case</FORM>',
  '<form/action="#">Malformed syntax</form>'
 ];
 for(const fragment of variants){
  const w=work();w.payload.files=[{path:"index.html",content:HTML.replace("</main>",fragment+"</main>")}];
  assert.throws(()=>compileX1PreviewPack(w),/X1_FORM_MUST_BE_LOCAL_DEMO/,fragment);
 }
 // Existing local click-only demonstration remains functional; no form submission path.
 assert.equal(compileX1PreviewPack(work()).sourceSha256,sha(HTML));
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
   if(url.includes("/v13/deployments/"+DEPLOY_ID))return reply({deployment:{id:DEPLOY_ID,projectId:"prj_JbkX4yKWygqBFRhkHL6nbeQXM46f",target:null,alias:[],url:URL.replace("https://","").replace(/\/$/,""),meta:{x1Packet:WORK,x1SourceSha:COMMIT,x1HtmlHash:sha(HTML),x1Release:"PREVIEW_ONLY"},readyState:"READY"}});
   if(url===URL)return reply(HTML,200,{"x-robots-tag":"noindex,nofollow","cache-control":"private, no-store"});
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
 await assert.rejects(()=>provider.commitSource(p),/X1_SOURCE_BASE_DRIFT_OR_UNVERIFIED/);
});
test("expired lease and source SHA drift fail before any remote mutation",async()=>{
 const stale=work();
 stale.lease.expiresAt=new Date(Date.now()+9000).toISOString();
 assert.throws(()=>compileX1PreviewPack(stale),/X1_PREVIEW_LEASE_NOT_SAFE_FOR_EXTERNAL_WRITE/);
 const noBase=work({source_sha:null});
 assert.throws(()=>compileX1PreviewPack(noBase),/X1_BASE_SOURCE_SHA_REQUIRED/);
 const pack=compileX1PreviewPack(work());
 const provider=createX1PreviewHttpProvider({githubToken:"test-gh",vercelToken:"test-v",
  fetchImpl:async()=>new Response(JSON.stringify({object:{sha:"f".repeat(40)}}),{status:200})});
 await assert.rejects(()=>provider.commitSource(pack),/X1_SOURCE_BASE_DRIFT_OR_UNVERIFIED/);
});
test("browser validator failure prevents a success receipt",async()=>{
 await assert.rejects(()=>executeX1PromptPreview(work(),{
  commitSource:async()=>({sha:COMMIT,url:"https://github.com/Strategic-Minds-AI/X1-OPERATING-SYSTEMS/commit/"+COMMIT}),
  deployPreview:async()=>({id:DEPLOY_ID,url:URL,target:null}),
  verifyDeployed:async()=>{throw new Error("INDEPENDENT_VALIDATION_REQUIRED");}
 }),/INDEPENDENT_VALIDATION_REQUIRED/);
});

test("deployment artifact identity rejects wrong ID, project, target, aliases, URL, and metadata",async()=>{
 const pack=compileX1PreviewPack(work());
 const good={id:DEPLOY_ID,projectId:"prj_JbkX4yKWygqBFRhkHL6nbeQXM46f",target:null,alias:[],
  url:URL.replace("https://","").replace(/\/$/,""),
  meta:{x1Packet:WORK,x1SourceSha:COMMIT,x1HtmlHash:sha(HTML),x1Release:"PREVIEW_ONLY"},
  readyState:"READY"};
 const bad=[
  ["wrong deployment id",{id:"dpl_Wrong"}, "X1_DEPLOYMENT_IDENTITY_MISMATCH"],
  ["wrong project",{projectId:"prj_wrong"}, "X1_DEPLOYMENT_IDENTITY_MISMATCH"],
  ["production target",{target:"production"}, "X1_RELEASE_TARGET_DENIED"],
  ["alias",{alias:["customer.example"]}, "X1_RELEASE_TARGET_DENIED"],
  ["wrong preview url",{url:"different.vercel.app"}, "X1_DEPLOYMENT_URL_MISMATCH"],
  ["wrong request",{meta:{...good.meta,x1Packet:"wrong"}}, "X1_DEPLOYMENT_ARTIFACT_MISMATCH"],
  ["wrong source",{meta:{...good.meta,x1SourceSha:"e".repeat(40)}}, "X1_DEPLOYMENT_ARTIFACT_MISMATCH"],
  ["wrong html",{meta:{...good.meta,x1HtmlHash:"f".repeat(64)}}, "X1_DEPLOYMENT_ARTIFACT_MISMATCH"],
  ["production release metadata",{meta:{...good.meta,x1Release:"PRODUCTION"}}, "X1_DEPLOYMENT_ARTIFACT_MISMATCH"],
  ["missing metadata",{meta:null}, "X1_DEPLOYMENT_ARTIFACT_MISMATCH"]
 ];
 for(const [name,change,code] of bad){
  let browserFetches=0;
  const provider=createX1PreviewHttpProvider({githubToken:"fake",vercelToken:"fake",
   fetchImpl:async(url)=>{
    if(url.includes("/v13/deployments/"+DEPLOY_ID))
     return new Response(JSON.stringify({deployment:{...good,...change}}),{status:200});
    browserFetches++;
    return new Response(HTML,{status:200,headers:{"x-robots-tag":"noindex","cache-control":"private, no-store"}});
   }});
  await assert.rejects(()=>provider.verifyDeployed(pack,{id:DEPLOY_ID,url:URL},COMMIT),new RegExp(code),name);
  assert.equal(browserFetches,0,"must reject before public fetch: "+name);
 }
});
test("deployment identity requires the exact source commit and preserves NON_PRODUCTION_MUTATION",async()=>{
 const pack=compileX1PreviewPack(work());
 let requests=0;
 const provider=createX1PreviewHttpProvider({githubToken:"fake",vercelToken:"fake",
  fetchImpl:async()=>{requests++;throw Error("should not be reached");}});
 await assert.rejects(()=>provider.verifyDeployed(pack,{id:DEPLOY_ID,url:URL},"not-sha"),/X1_DEPLOY_SOURCE_REQUIRED/);
 assert.equal(requests,0);
 assert.throws(()=>compileX1PreviewPack(work({action_class:"PREVIEW_WRITE"})),/X1_NONPRODUCTION_ACTION_REQUIRED/);
});


test("real Vercel nested project response accepts only exact X1 preview identity",async()=>{
 const pack=compileX1PreviewPack(work());
 const baseLive={id:DEPLOY_ID,project:{id:"prj_JbkX4yKWygqBFRhkHL6nbeQXM46f"},
  target:null,alias:[],url:URL.replace("https://","").replace(/\/$/,""),
  meta:{x1Packet:WORK,x1SourceSha:COMMIT,x1HtmlHash:sha(HTML),x1Release:"PREVIEW_ONLY"},
  readyState:"READY"};
 const cases=[
  ["exact nested project",{},null],
  ["different nested project",{project:{id:"prj_other"}},"X1_DEPLOYMENT_IDENTITY_MISMATCH"],
  ["missing project object",{project:null},"X1_DEPLOYMENT_IDENTITY_MISMATCH"],
  ["unexpected alias",{alias:["unexpected.example"]},"X1_RELEASE_TARGET_DENIED"],
  ["unknown artifact metadata",{meta:{}},"X1_DEPLOYMENT_ARTIFACT_MISMATCH"]
 ];
 for(const [name,change,errorCode] of cases){
  let providerReads=0,htmlReads=0;
  const provider=createX1PreviewHttpProvider({githubToken:"fake",vercelToken:"fake",
   fetchImpl:async(url)=>{
    if(url.includes("/v13/deployments/"+DEPLOY_ID)){
     providerReads++;
     return new Response(JSON.stringify({...baseLive,...change}),{status:200});
    }
    if(url===URL){
     htmlReads++;
     return new Response(HTML,{status:200,headers:{"x-robots-tag":"noindex,nofollow","cache-control":"private, no-store"}});
    }
    throw new Error("unexpected provider request");
   }});
  if(errorCode){
   await assert.rejects(()=>provider.verifyDeployed(pack,{id:DEPLOY_ID,url:URL},COMMIT),new RegExp(errorCode),name);
   assert.equal(htmlReads,0,name+" must fail before browser fetch");
  } else {
   await provider.verifyDeployed(pack,{id:DEPLOY_ID,url:URL},COMMIT);
   assert.equal(htmlReads,1,name+" must validate exact HTML");
  }
  assert.equal(providerReads,1,name+" must use one resolved deployment");
 }
});

test("contradictory flat and nested project identities fail before HTML fetch",async()=>{
 const pack=compileX1PreviewPack(work());
 const project="prj_JbkX4yKWygqBFRhkHL6nbeQXM46f";
 const base={id:DEPLOY_ID,project:{id:project},target:null,alias:[],
  url:URL.replace("https://","").replace(/\/$/,""),
  meta:{x1Packet:WORK,x1SourceSha:COMMIT,x1HtmlHash:sha(HTML),x1Release:"PREVIEW_ONLY"},
  readyState:"READY"};
 const cases=[
  ["nested only",{},false],
  ["flat only",{project:undefined,projectId:project},false],
  ["both agree",{projectId:project},false],
  ["flat valid nested invalid",{projectId:project,project:{id:"prj_wrong"}},true],
  ["flat invalid nested valid",{projectId:"prj_wrong"},true],
  ["flat explicitly null nested valid",{projectId:null},true],
  ["both project identifiers missing",{project:undefined},true]
 ];
 for(const [name,change,shouldReject] of cases){
  let htmlReads=0,providerReads=0;
  const provider=createX1PreviewHttpProvider({githubToken:"synthetic-gh",vercelToken:"synthetic-vercel",
   fetchImpl:async(url)=>{
    if(url.includes("/v13/deployments/"+DEPLOY_ID)){
     providerReads++;
     return new Response(JSON.stringify({...base,...change}),{status:200});
    }
    if(url===URL){
     htmlReads++;
     return new Response(HTML,{status:200,headers:{"x-robots-tag":"noindex,nofollow","cache-control":"private, no-store"}});
    }
    throw new Error("unexpected request");
   }});
  if(shouldReject){
   await assert.rejects(()=>provider.verifyDeployed(pack,{id:DEPLOY_ID,url:URL},COMMIT),
    /X1_DEPLOYMENT_IDENTITY_MISMATCH/,name);
   assert.equal(htmlReads,0,name+" must deny before HTML fetch");
  }else{
   await provider.verifyDeployed(pack,{id:DEPLOY_ID,url:URL},COMMIT);
   assert.equal(htmlReads,1,name+" should validate HTML once");
  }
  assert.equal(providerReads,1,name+" should verify one deployment identity");
 }
});

test("missing explicit preview attestation rejects before HTML fetch",async()=>{
 const pack=compileX1PreviewPack(work());
 const base={id:DEPLOY_ID,project:{id:"prj_JbkX4yKWygqBFRhkHL6nbeQXM46f"},
  target:null,alias:[],url:URL.replace("https://","").replace(/\/$/,""),
  meta:{x1Packet:WORK,x1SourceSha:COMMIT,x1HtmlHash:sha(HTML),x1Release:"PREVIEW_ONLY"},
  readyState:"READY"};
 const cases=[
  ["target omitted",{target:undefined}],
  ["non-null preview target",{target:"preview"}],
  ["aliases omitted",{alias:undefined}],
  ["aliases null",{alias:null}],
  ["aliases malformed",{alias:{}}],
  ["aliases populated",{alias:["production.example"]}]
 ];
 for(const [name,change] of cases){
  let htmlReads=0,providerReads=0;
  const provider=createX1PreviewHttpProvider({githubToken:"synthetic-gh",vercelToken:"synthetic-vercel",
   fetchImpl:async(url)=>{
    if(url.includes("/v13/deployments/"+DEPLOY_ID)){
     providerReads++;
     return new Response(JSON.stringify({...base,...change}),{status:200});
    }
    if(url===URL){htmlReads++;return new Response(HTML,{status:200});}
    throw new Error("unexpected request");
   }});
  await assert.rejects(()=>provider.verifyDeployed(pack,{id:DEPLOY_ID,url:URL},COMMIT),
   /X1_RELEASE_TARGET_DENIED/,name);
  assert.equal(htmlReads,0,name+" must deny before HTML fetch");
  assert.equal(providerReads,1,name+" must examine one provider deployment");
 }
});

test("served preview requires explicit X-Robots-Tag noindex directive",async()=>{
 const pack=compileX1PreviewPack(work());
 const live={id:DEPLOY_ID,project:{id:"prj_JbkX4yKWygqBFRhkHL6nbeQXM46f"},
  target:null,alias:[],url:URL.replace("https://","").replace(/\/$/,""),
  meta:{x1Packet:WORK,x1SourceSha:COMMIT,x1HtmlHash:sha(HTML),x1Release:"PREVIEW_ONLY"},
  readyState:"READY"};
 const cases=[
  ["missing header",{},true],
  ["explicit index",{"x-robots-tag":"index,follow"},true],
  ["lookalike directive",{"x-robots-tag":"not-noindex-allowed"},true],
  ["conflicting index token",{"x-robots-tag":"noindex, index"},true],
  ["agent-scoped only noindex",{"x-robots-tag":"googlebot: noindex"},true],
  ["unknown directive mixed with noindex",{"x-robots-tag":"noindex, follow"},true],
  ["safe declared complete policy",{"x-robots-tag":"noindex, nofollow, noarchive"},false],
  ["case insensitive",{"x-robots-tag":"NoIndex, nofollow"},false],
  ["space-separated directive",{"x-robots-tag":"nofollow noindex"},false]
 ];
 for(const [name,headers,deny] of cases){
  let providerReads=0,htmlReads=0;
  const provider=createX1PreviewHttpProvider({githubToken:"synthetic-gh",vercelToken:"synthetic-vercel",
   fetchImpl:async url=>{
    if(url.includes("/v13/deployments/"+DEPLOY_ID)){
     providerReads++;
     return new Response(JSON.stringify({deployment:live}),{status:200});
    }
    if(url===URL){
     htmlReads++;
     return new Response(HTML,{status:200,headers:{"cache-control":"private, no-store",...headers}});
    }
    throw new Error("unexpected provider request");
   }});
  const check=()=>provider.verifyDeployed(pack,{id:DEPLOY_ID,url:URL},COMMIT);
  if(deny)await assert.rejects(check,/X1_LIVE_NOINDEX_MISSING/,name);
  else await check();
  assert.equal(providerReads,1,name+" must validate exact provider identity");
  assert.equal(htmlReads,1,name+" must inspect the actual served response header");
 }
});
test("served preview requires private no-store response cache policy",async()=>{
 const pack=compileX1PreviewPack(work());
 const live={id:DEPLOY_ID,project:{id:"prj_JbkX4yKWygqBFRhkHL6nbeQXM46f"},
  target:null,alias:[],url:URL.replace("https://","").replace(/\/$/,""),
  meta:{x1Packet:WORK,x1SourceSha:COMMIT,x1HtmlHash:sha(HTML),x1Release:"PREVIEW_ONLY"},
  readyState:"READY"};
 const cases=[
  ["header omitted",{},true],
  ["public cache",{"cache-control":"public, max-age=0"},true],
  ["cacheable private",{"cache-control":"private, max-age=3600"},true],
  ["no-store without private",{"cache-control":"no-store"},true],
  ["private without no-store",{"cache-control":"private"},true],
  ["conflicting public",{"cache-control":"public, private, no-store"},true],
  ["shared cache token",{"cache-control":"private, no-store, s-maxage=60"},true],
  ["declared policy",{"cache-control":"private, no-store"},false],
  ["case insensitive",{"cache-control":"Private, No-Store"},false]
 ];
 for(const [name,cacheHeaders,deny] of cases){
  let providerReads=0,htmlReads=0;
  const provider=createX1PreviewHttpProvider({githubToken:"synthetic-gh",vercelToken:"synthetic-vercel",
   fetchImpl:async url=>{
    if(url.includes("/v13/deployments/"+DEPLOY_ID)){
     providerReads++;
     return new Response(JSON.stringify({deployment:live}),{status:200});
    }
    if(url===URL){
     htmlReads++;
     return new Response(HTML,{status:200,headers:{"x-robots-tag":"noindex,nofollow",...cacheHeaders}});
    }
    throw new Error("unexpected provider request");
   }});
  const check=()=>provider.verifyDeployed(pack,{id:DEPLOY_ID,url:URL},COMMIT);
  if(deny)await assert.rejects(check,/X1_LIVE_CACHE_POLICY_MISMATCH/,name);
  else await check();
  assert.equal(providerReads,1,name+" must verify exact provider artifact");
  assert.equal(htmlReads,1,name+" must inspect served response headers");
 }
});
