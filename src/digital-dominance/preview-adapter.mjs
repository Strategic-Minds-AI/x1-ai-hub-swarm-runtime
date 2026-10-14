// Runs INSIDE the existing X1 signed-authorization/lease/ledger handler.
// One fixed synthetic fixture; no scheduler, AI, production target or domain calls.
import {createHash} from 'node:crypto';
import {renderSyntheticPreview} from './render-synthetic-preview.mjs';
export const DD_PREVIEW_KIND='DD_SYNTHETIC_VERCEL_PREVIEW_V1';
export const DD_SOURCE_SHA='c647c23331d658674eed36644cce9832833cc8cc';
export const DD_REPO='XTREME-SYSTEMS/digital-dominance';
export const DD_PROJECT='prj_mgySytKyeK5i9DwnQDRGHVjyenrz';
export const DD_TEAM='team_aFdds8lsbHMwe2ip4aQdbQ3d';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sha40=/^[a-f0-9]{40}$/;
const hash=s=>createHash('sha256').update(s).digest('hex');
const gate=(ok,code)=>{if(!ok)throw new Error('DD_PREVIEW_'+code);};
export function assertDdWork(work,config){
 gate(config.environment==='preview','ENVIRONMENT_DENIED');
 gate(config.tenantId===work.tenant_id&&config.workerId===work.lease?.holderAgentId,'IDENTITY_DENIED');
 gate(uuid.test(work.work_id)&&uuid.test(work.tenant_id),'UUID_INVALID');
 gate(work.action_class==='NON_PRODUCTION_MUTATION'&&work.source_sha===DD_SOURCE_SHA,'SOURCE_OR_ACTION_DENIED');
 gate(work.attempt===1&&work.lease?.taskId===work.task_id,'ATTEMPT_OR_LEASE_DENIED');
 gate(/^dd\.preview\.synthetic\.[a-z0-9-]{6,72}$/.test(work.task_id),'TASK_DENIED');
 gate(work.required_capabilities?.length===1&&work.required_capabilities[0].id==='dd-synthetic-preview-only'&&work.required_capabilities[0].mechanism==='policy','CAPABILITY_REQUIRED');
 gate(work.rollback_reference&&work.approval_reference,'RECEIPT_REFERENCES_REQUIRED');
 const p=work.payload;
 gate(p&&Object.keys(p).sort().join('|')===['kind','quantity','synthetic','release_mode','indexable','customer_outbound','paid_ai'].sort().join('|'),'PAYLOAD_DENIED');
 gate(p.kind===DD_PREVIEW_KIND&&p.quantity===1&&p.synthetic===true&&p.release_mode==='preview'&&p.indexable===false&&p.customer_outbound===false&&p.paid_ai===false,'POLICY_DENIED');
 assertDdLease(work);
}
export function assertDdAuthorization(work,authorization){
 if(work.payload?.kind!==DD_PREVIEW_KIND)return;
 gate(authorization.allowed===true&&authorization.requested_action===work.action_class&&authorization.task_id===work.task_id&&authorization.tenant_id===work.tenant_id&&authorization.agent_id===work.lease.holderAgentId,'AUTHORIZATION_CONTEXT_DENIED');
 gate(authorization.capabilities_required?.length===1&&authorization.capabilities_required[0]==='dd-synthetic-preview-only'&&authorization.capabilities_resolved?.includes('dd-synthetic-preview-only'),'SIGNED_SCOPE_REQUIRED');
}
export function assertDdLease(work){
 const now=Date.now(),a=Date.parse(work.lease?.acquiredAt),e=Date.parse(work.lease?.expiresAt);
 gate(Number.isFinite(a)&&a<=now&&Number.isFinite(e)&&e>now+30000&&e-a<=600000,'LEASE_EXPIRED_OR_INVALID');
}
export function compileDdPack(work,config,fixtureText){
 assertDdWork(work,config);
 return compileDdArtifact(work.work_id,work.tenant_id,fixtureText);
}
export function compileDdArtifact(workId,tenantId,fixtureText){
 gate(uuid.test(workId)&&uuid.test(tenantId),'UUID_INVALID');
 const work={work_id:workId,tenant_id:tenantId};
 const r=renderSyntheticPreview(fixtureText);
 // The worker invokes the exact existing factory renderer, not an AI model.
 const html=r.html.replace('</body></html>',`<!-- X1 work=${work.work_id} source=${DD_SOURCE_SHA} -->\n</body></html>`);
 const root=`public/factory-jobs/${work.work_id}`;
 const manifest={schema:'dd-worker-preview-v1',work_id:work.work_id,tenant_id:work.tenant_id,source_sha:DD_SOURCE_SHA,html_sha256:hash(html),fixture_sha256:r.fixture_sha256,synthetic:true,indexable:false,production_release:false,independent_qa:'PENDING'};
 return {workId:work.work_id,html,manifest,branch:`feature/dd-preview-${work.work_id}`,path:`/factory-jobs/${work.work_id}/`,files:[{path:root+'/index.html',mode:'100644',type:'blob',content:html},{path:root+'/manifest.json',mode:'100644',type:'blob',content:JSON.stringify(manifest,null,2)+'\n'},{path:'vercel.json',mode:'100644',type:'blob',content:JSON.stringify({headers:[...['/canary/(.*)','/api/canary-lead','/factory-demo/(.*)','/factory-jobs/(.*)'].map(source=>({source,headers:[{key:'X-Robots-Tag',value:'noindex, nofollow, noarchive'},{key:'Cache-Control',value:'no-store'},{key:'X-Content-Type-Options',value:'nosniff'}]}))]},null,2)+'\n'}]};
}
export function ddDeploymentRequest(pack,sourceSha){
 gate(sha40.test(sourceSha),'COMMIT_INVALID');
 return {name:'digital-dominance',project:DD_PROJECT,gitSource:{type:'github',repoId:'1372732258',ref:pack.branch,sha:sourceSha},meta:{ddWorkId:pack.workId,ddSourceSha:sourceSha,ddHtmlSha256:pack.manifest.html_sha256,ddRelease:'PREVIEW_ONLY'}};
}
export function createDdHttpProvider({githubToken,vercelToken,fetchImpl=fetch}){
 gate(typeof githubToken==='string'&&githubToken.length>10&&typeof vercelToken==='string'&&vercelToken.length>10,'PROVIDER_CREDENTIALS_NOT_BOUND');
 const gh='https://api.github.com/repos/'+DD_REPO;
 async function api(url,method='GET',body){
  const token=url.startsWith(gh)?githubToken:vercelToken;
  let r;try{r=await fetchImpl(url,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}catch{throw new Error('DD_PREVIEW_RECONCILIATION_REQUIRED');}
  gate(r.ok,'PROVIDER_HTTP_'+r.status);return r.json();
 }
 return {
  async readFixture(){
   const r=await fetchImpl(`https://raw.githubusercontent.com/${DD_REPO}/${DD_SOURCE_SHA}/factory/fixtures/synthetic-epoxy.json`,{redirect:'error',signal:AbortSignal.timeout(10000)});gate(r.ok,'FIXTURE_UNAVAILABLE');return r.text();
  },
  async commitSource(pack){
   const base=await api(gh+'/git/commits/'+DD_SOURCE_SHA);gate(sha40.test(base.tree?.sha??''),'BASE_TREE_INVALID');
   const tree=await api(gh+'/git/trees','POST',{base_tree:base.tree.sha,tree:pack.files});gate(sha40.test(tree.sha??''),'TREE_INVALID');
   const c=await api(gh+'/git/commits','POST',{tree:tree.sha,parents:[DD_SOURCE_SHA],message:'feat(factory): X1 synthetic preview '+pack.workId});gate(sha40.test(c.sha??''),'COMMIT_INVALID');
   const ref=await api(gh+'/git/refs','POST',{ref:'refs/heads/'+pack.branch,sha:c.sha});gate(ref.object?.sha===c.sha,'BRANCH_IDENTITY_MISMATCH');
   return {sha:c.sha,url:`https://github.com/${DD_REPO}/commit/${c.sha}`};
  },
  async deploy(pack,source){
   // Existing Git integration already deploys each new feature branch. Reuse
   // its provider-native deployment rather than paying for a duplicate POST.
   for(let n=0;n<30;n++){
    const list=await api('https://api.vercel.com/v6/deployments?teamId='+DD_TEAM+'&projectId='+DD_PROJECT+'&limit=20');
    gate(Array.isArray(list.deployments),'DEPLOYMENT_LIST_INVALID');
    const matching=list.deployments.filter(d=>d.meta?.githubCommitSha===source.sha&&d.meta?.githubCommitRef===pack.branch&&d.target==null).sort((a,b)=>(a.created??0)-(b.created??0));
    if(matching.length)return matching[0];
    await new Promise(r=>setTimeout(r,2000));
   }
   // No fallback POST: absence may be integration latency or a paused binding.
   throw new Error('DD_PREVIEW_GIT_DEPLOYMENT_NOT_OBSERVED');
  },
  async inspect(id){return api('https://api.vercel.com/v13/deployments/'+id+'?teamId='+DD_TEAM);},
  fetchImpl,
 };
}
export function assertDdDeployment(d,pack,sourceSha){
 gate(/^dpl_[a-zA-Z0-9]+$/.test(d.id??''),'DEPLOYMENT_ID_INVALID');
 gate((d.projectId??d.project?.id)===DD_PROJECT&&d.target==null,'TARGET_OR_PROJECT_DENIED');
 gate(typeof d.url==='string'&&/^digital-dominance-[a-z0-9-]+\.vercel\.app$/.test(d.url),'HOST_DENIED');
 gate(d.meta?.githubCommitSha===sourceSha&&d.meta?.githubCommitRef===pack.branch&&d.meta?.githubRepo==='digital-dominance'&&d.meta?.githubOrg==='XTREME-SYSTEMS','PROVIDER_SOURCE_MISMATCH');
 gate(!d.gitSource?.sha||d.gitSource.sha===sourceSha,'GIT_SOURCE_MISMATCH');
 for(const [key,value] of Object.entries({ddWorkId:pack.workId,ddHtmlSha256:pack.manifest.html_sha256,ddRelease:'PREVIEW_ONLY'}))gate(d.meta?.[key]===undefined||d.meta[key]===value,'CUSTOM_METADATA_MISMATCH');
 // Nonproduction Git branch aliases are fine; a provider-reported production target is not.
 gate(!d.alias?.some(a=>!/^digital-dominance-git-feature-/.test(a)),'ALIAS_DENIED');
}
export async function verifyDdLive(pack,deployment,sourceSha,fetchImpl=fetch){
 assertDdDeployment(deployment,pack,sourceSha);gate(deployment.readyState==='READY','NOT_READY');
 const origin='https://'+deployment.url;
 const get=async p=>{const r=await fetchImpl(origin+p,{redirect:'error',signal:AbortSignal.timeout(12000)});gate(r.status===200,'HTTP_'+r.status);gate(r.headers.get('x-robots-tag')?.includes('noindex'),'HTTP_NOINDEX_REQUIRED');return r;};
 const html=await (await get(pack.path)).text();
 // Accept only Vercel's exact deployment-bound feedback suffix.
 const toolbar=`<script async data-explicit-opt-in="true" data-deployment-id="${deployment.id}" src="https://vercel.live/_next-live/feedback/feedback.js"></script>`;
 gate(html===pack.html||html===pack.html+toolbar,'HTML_HASH_MISMATCH');
 gate(/<meta name="robots" content="noindex,nofollow,noarchive">/.test(html),'HTML_NOINDEX_REQUIRED');
 const manifest=await (await get(pack.path+'manifest.json')).json();gate(JSON.stringify(manifest)===JSON.stringify(pack.manifest),'MANIFEST_MISMATCH');
 return {source_sha:sourceSha,html_sha256:pack.manifest.html_sha256,deployment_id:deployment.id,preview_url:origin+pack.path,http_status:200,noindex:true,independent_qa:'PENDING',release:'PREVIEW_ONLY'};
}
export async function executeDdPreview(work,config,provider){
 assertDdWork(work,config);const pack=compileDdPack(work,config,await provider.readFixture());assertDdLease(work);
 const source=await provider.commitSource(pack);gate(sha40.test(source.sha??''),'COMMIT_INVALID');assertDdLease(work);
 let created;try{created=await provider.deploy(pack,source);}catch{throw new Error('DD_PREVIEW_RECONCILIATION_REQUIRED');}
 gate(/^dpl_[a-zA-Z0-9]+$/.test(created.id??''),'DEPLOYMENT_ID_INVALID');
 for(let n=0;n<60;n++){
  assertDdLease(work);const d=await provider.inspect(created.id);assertDdDeployment(d,pack,source.sha);
  if(d.readyState==='READY')return {...await verifyDdLive(pack,d,source.sha,provider.fetchImpl),work_id:work.work_id,tenant_id:work.tenant_id,source_url:source.url,source_branch:pack.branch};
  gate(!['ERROR','CANCELED','BLOCKED'].includes(d.readyState),'DEPLOYMENT_FAILED');await new Promise(r=>setTimeout(r,2000));
 }
 throw new Error('DD_PREVIEW_RECONCILIATION_REQUIRED');
}
