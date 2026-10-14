/// <reference lib="dom" />
import type {LeasedWork} from './types.js';
import {assertDdWork,assertDdLease,createDdHttpProvider,executeDdPreview} from './digital-dominance/preview-adapter.mjs';
import {assertIndependentQaConfig} from './x1-preview-qa-handoff.js';
interface Config {environment:string;tenantId:string;workerId:string;env:Record<string,string|undefined>;fetchImpl?:typeof fetch;}
const requireValue=(env:Config['env'],name:string)=>{const v=env[name];if(!v)throw new Error('DD_PREVIEW_CONFIG_REQUIRED:'+name);return v;};
export function assertDdWorkerBindings(work:LeasedWork,c:Config){
 assertDdWork(work,c);
 // The live SQL completion fence currently only recognizes the older X1 kind.
 // This flag must remain unset until an independent read-back proves DD coverage.
 if(c.env.DD_PREVIEW_ENABLED!=='true'||c.env.DD_PREVIEW_COMPLETION_FENCE_VERIFIED!=='true')throw new Error('DD_PREVIEW_ACTIVATION_OR_DATABASE_FENCE_NOT_VERIFIED');
 const provider={githubToken:requireValue(c.env,'X1_GITHUB_PREVIEW_TOKEN'),vercelToken:requireValue(c.env,'X1_VERCEL_PREVIEW_TOKEN'),fetchImpl:c.fetchImpl};
 const qa={enabled:c.env.X1_INDEPENDENT_PREVIEW_QA_ENABLED==='true',endpoint:requireValue(c.env,'X1_PREVIEW_QA_ENDPOINT'),bearerToken:requireValue(c.env,'X1_PREVIEW_QA_TOKEN'),validatorId:requireValue(c.env,'X1_PREVIEW_QA_VALIDATOR_ID'),workerId:c.workerId};
 assertIndependentQaConfig(qa,work);return {provider,qa};
}
export async function runDdWorkerPreview(work:LeasedWork,c:Config){
 const {provider,qa}=assertDdWorkerBindings(work,c);
 const build=await executeDdPreview(work,c,createDdHttpProvider(provider));
 assertDdLease(work);
 let r:Response;
 try{r=await (c.fetchImpl??fetch)(qa.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'content-type':'application/json',authorization:'Bearer '+qa.bearerToken},body:JSON.stringify({kind:'DD_PREVIEW_INDEPENDENT_BROWSER_QA_V1',work_id:work.work_id,tenant_id:work.tenant_id,task_id:work.task_id,lease_id:work.lease.leaseId,approved_source_sha:work.source_sha,build_source_sha:build.source_sha,html_sha256:build.html_sha256,deployment_id:build.deployment_id,preview_url:build.preview_url,builder_id:c.workerId,expected_validator_id:qa.validatorId,release:'PREVIEW_ONLY',required_viewports:[{width:1440,height:900},{width:390,height:844}],required_checks:['source_hash','noindex','responsive_layout','calculator','synthetic_api','no_console_errors']})});}catch{throw new Error('DD_PREVIEW_QA_RECONCILIATION_REQUIRED');}
 if(!r.ok)throw new Error('DD_PREVIEW_QA_RECONCILIATION_REQUIRED');
 let proof:any;try{proof=await r.json();}catch{throw new Error('DD_PREVIEW_QA_RECONCILIATION_REQUIRED');}
 if(!proof||typeof proof!=='object')throw new Error('DD_PREVIEW_QA_RECEIPT_MALFORMED');
 if(proof.status!=='PASS'||proof.database_receipt_persisted!==true||proof.validator_id!==qa.validatorId||proof.validator_id===c.workerId||proof.work_id!==work.work_id||proof.tenant_id!==work.tenant_id||proof.source_sha!==work.source_sha||proof.build_source_sha!==build.source_sha||proof.html_sha256!==build.html_sha256||proof.deployment_id!==build.deployment_id||proof.lease_id!==work.lease.leaseId||!/^guardian:[a-zA-Z0-9:._-]{8,140}$/.test(proof.receipt_id??''))throw new Error('DD_PREVIEW_QA_RECEIPT_MISMATCH');
 assertDdLease(work);
 return {kind:work.payload.kind,build,independent_qa:'PASS',qaReceiptId:proof.receipt_id,validatorId:proof.validator_id,status:'QA_RECORDED_PERSISTENCE_FENCED'};
}
