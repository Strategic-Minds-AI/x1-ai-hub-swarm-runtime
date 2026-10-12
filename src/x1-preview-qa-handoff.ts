/// <reference lib="dom" />
// Existing worker -> separately deployed independent browser validator.
// This is NOT a self-attestation: the validator must persist a matching
// X1_PREVIEW_INDEPENDENT_QA receipt to the existing Staging database.
// The SQL x1_complete_execution function independently verifies that receipt.
// No new queue/worker/cron and no production release permissions.
import type {LeasedWork} from "./types.js";
import type {X1PreviewReceipt} from "./x1-prompt-preview.js";
import {assertFreshLease} from "./x1-prompt-preview.js";

const STAGING_HOST="uvdkzsbjackpjvpoxtyk.supabase.co";
const HEX64=/^[a-f0-9]{64}$/;
const SOURCE=/^[a-f0-9]{40}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEPLOY=/^dpl_[A-Za-z0-9]+$/;
const HOST=/^website-launch-engine-[a-z0-9-]+\.vercel\.app$/;
const RECEIPT=/^[A-Za-z0-9_.:-]{12,150}$/;
export interface X1ValidatorConfig {
  enabled:boolean;
  endpoint:string;
  bearerToken:string;
  validatorId:string;
  workerId:string;
  fetchImpl?:typeof fetch;
  timeoutMs?:number;
}
export interface X1QaProof {
  receipt_id:string;
  validator_id:string;
  work_id:string;
  tenant_id:string;
  source_sha:string;
  html_sha256:string;
  deployment_id:string;
  status:"PASS";
  database_receipt_persisted:true;
}
export function assertIndependentQaConfig(config:X1ValidatorConfig,work:LeasedWork):void {
  if(config.enabled!==true)throw new Error("X1_INDEPENDENT_QA_DISABLED");
  if(!UUID.test(work.work_id)||!UUID.test(work.tenant_id))throw new Error("X1_QA_WORK_CONTEXT_INVALID");
  if(config.validatorId===config.workerId||!config.validatorId?.trim()||!config.workerId?.trim())
    throw new Error("X1_QA_DIFFERENT_VALIDATOR_ID_REQUIRED");
  if(typeof config.bearerToken!=="string"||config.bearerToken.length<24)
    throw new Error("X1_QA_SERVER_CREDENTIAL_NOT_BOUND");
  let endpoint:URL;
  try{endpoint=new URL(config.endpoint);}catch{throw new Error("X1_QA_ENDPOINT_INVALID");}
  if(endpoint.protocol!=="https:"||endpoint.username||endpoint.password||
    endpoint.port!==""||endpoint.hash||endpoint.search||
    endpoint.pathname!=="/api/x1/validate-preview"||
    !/^[a-z0-9-]+(?:\.up\.railway\.app|\.vercel\.app)$/.test(endpoint.hostname)||
    endpoint.hostname===STAGING_HOST)
    throw new Error("X1_QA_ENDPOINT_NOT_ALLOWLISTED");
  const timeout=config.timeoutMs??15000;
  if(!Number.isInteger(timeout)||timeout<1000||timeout>20000)
    throw new Error("X1_QA_TIMEOUT_INVALID");
}
export async function requireIndependentQaProof(
  work:LeasedWork,build:X1PreviewReceipt,config:X1ValidatorConfig
):Promise<X1QaProof>{
  assertIndependentQaConfig(config,work);
  assertFreshLease(work);
  if(build.work_id!==work.work_id||build.tenant_id!==work.tenant_id||
    !SOURCE.test(build.source_sha)||!HEX64.test(build.html_sha256)||
    !DEPLOY.test(build.deployment_id)||
    build.independent_qa!=="PENDING"||build.release!=="PREVIEW_ONLY")
    throw new Error("X1_QA_BUILD_PROOF_CONTEXT_MISMATCH");
  const u=new URL(build.preview_url);
  if(u.protocol!=="https:"||!HOST.test(u.hostname)||
    u.pathname!=="/"||u.search||u.hash)
    throw new Error("X1_QA_PREVIEW_TARGET_DENIED");
  // Separate validator must actually browse the preview, compare original
  // source bytes, mobile+desktop, critical actions and then persist its receipt.
  // An HTTP response is a claim; the database fence verifies the real row.
  const req={
    kind:"X1_PREVIEW_INDEPENDENT_BROWSER_QA_V1",
    work_id:work.work_id,tenant_id:work.tenant_id,
    task_id:work.task_id,lease_id:work.lease.leaseId,
    approved_source_sha:work.source_sha,
    build_source_sha:build.source_sha,
    html_sha256:build.html_sha256,
    deployment_id:build.deployment_id,preview_url:build.preview_url,
    builder_id:config.workerId,expected_validator_id:config.validatorId,
    required_viewports:[{width:1440,height:900},{width:390,height:844}],
    required_checks:["responsive_layout","navigation","estimate_calculator","no_console_errors","source_hash","noindex"],
    release:"PREVIEW_ONLY"
  };
  let response:Response;
  try{response=await (config.fetchImpl??fetch)(config.endpoint,{
    method:"POST",redirect:"error",
    headers:{"content-type":"application/json",
      authorization:"Bearer "+config.bearerToken,accept:"application/json"},
    signal:AbortSignal.timeout(config.timeoutMs??15000),
    body:JSON.stringify(req)
  });}catch{throw new Error("X1_QA_VALIDATOR_UNREACHABLE_OR_TIMEOUT");}
  if(!response.ok)throw new Error("X1_QA_VALIDATOR_REJECTED_"+response.status);
  let answer:unknown;
  try{answer=await response.json();}catch{throw new Error("X1_QA_VALIDATOR_BAD_RESPONSE");}
  if(!answer||typeof answer!=="object")throw new Error("X1_QA_PROOF_MALFORMED");
  const qa=answer as Partial<X1QaProof>;
  if(qa.status!=="PASS"||qa.database_receipt_persisted!==true||
    !RECEIPT.test(qa.receipt_id??"")||
    qa.validator_id!==config.validatorId||qa.validator_id===config.workerId||
    qa.work_id!==work.work_id||qa.tenant_id!==work.tenant_id||
    qa.source_sha!==work.source_sha||
    qa.html_sha256!==build.html_sha256||
    qa.deployment_id!==build.deployment_id)
    throw new Error("X1_QA_INDEPENDENT_RECEIPT_MISMATCH");
  assertFreshLease(work);
  return qa as X1QaProof;
}
