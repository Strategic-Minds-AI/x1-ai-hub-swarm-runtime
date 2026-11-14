/// <reference lib="dom" />
/**
 * Private WLE artifact -> EXISTING independent validator service.
 * Stage-only contract. The endpoint is not asserted deployed or bound.
 * Builder self-readback MUST NOT count as independent QA.
 */
import type {LeasedWork} from "./types.js";
import type {WlePrivatePreviewReceipt} from "./wle-preview-adapter.js";
import {WLE_APPROVED_SOURCE_SHA, WLE_PREVIEW_KIND} from "./wle-preview-adapter.js";
import {assertFreshLease} from "./x1-prompt-preview.js";

export const WLE_PRIVATE_VALIDATOR_ENDPOINT =
  "https://cloud-browser-mcp-staging-staging.up.railway.app/api/x1/validate-wle-private-preview";
const SHA256=/^[0-9a-f]{64}$/;
const RECEIPT=/^X1_WLE_PRIVATE_QA_[A-Za-z0-9_.:-]{12,120}$/;

export interface WlePrivateQaConfig {
  enabled: boolean;
  endpoint: string;
  bearerToken: string;
  validatorId: string;
  workerId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}
export interface WlePrivateQaProof {
  kind: "WLE_PRIVATE_PREVIEW_INDEPENDENT_QA_V1";
  receipt_id: string;
  validator_id: string;
  work_id: string;
  tenant_id: string;
  task_id: string;
  lease_id: string;
  source_sha: string;
  artifact_sha256: string;
  byte_size: number;
  storage_path: string;
  status: "PASS";
  database_receipt_persisted: true;
  bucket_private: true;
  noindex: true;
  released: false;
}

export function assertWlePrivateQaConfig(config:WlePrivateQaConfig,work:LeasedWork):void {
  if(config.enabled!==true) throw new Error("WLE_PRIVATE_QA_DISABLED");
  if(work.action_class!=="PREVIEW_WRITE" ||
     work.payload?.kind!==WLE_PREVIEW_KIND ||
     work.source_sha!==WLE_APPROVED_SOURCE_SHA)
    throw new Error("WLE_PRIVATE_QA_WORK_NOT_APPROVED");
  if(config.validatorId===config.workerId ||
     !config.validatorId?.trim() || config.workerId!==work.lease.holderAgentId)
    throw new Error("WLE_PRIVATE_QA_INDEPENDENT_IDENTITY_REQUIRED");
  if(typeof config.bearerToken!=="string" || config.bearerToken.length<24)
    throw new Error("WLE_PRIVATE_QA_SERVER_TOKEN_NOT_BOUND");
  if(config.endpoint!==WLE_PRIVATE_VALIDATOR_ENDPOINT)
    throw new Error("WLE_PRIVATE_QA_ENDPOINT_NOT_ALLOWLISTED");
  const timeout=config.timeoutMs??15000;
  if(!Number.isInteger(timeout)||timeout<1000||timeout>20000)
    throw new Error("WLE_PRIVATE_QA_TIMEOUT_INVALID");
  assertFreshLease(work);
}

export async function requireWlePrivateQaProof(
  work:LeasedWork, artifact:WlePrivatePreviewReceipt, config:WlePrivateQaConfig,
):Promise<WlePrivateQaProof> {
  assertWlePrivateQaConfig(config,work);
  const expectedPath="wle-preview/"+work.tenant_id+"/"+work.work_id+"/index.html";
  if(artifact.work_id!==work.work_id ||
     artifact.tenant_id!==work.tenant_id ||
     artifact.worker_id!==config.workerId ||
     artifact.source_sha!==WLE_APPROVED_SOURCE_SHA ||
     artifact.storage_bucket!=="artifact-staging" ||
     artifact.storage_path!==expectedPath ||
     artifact.storage_verified!==true ||
     artifact.private!==true ||
     artifact.noindex!==true ||
     artifact.released!==false ||
     artifact.public_url!==null ||
     !SHA256.test(artifact.sha256) ||
     !SHA256.test(artifact.approved_template_sha256) ||
     !Number.isInteger(artifact.byte_size) ||
     artifact.byte_size<1000||artifact.byte_size>128*1024)
    throw new Error("WLE_PRIVATE_QA_ARTIFACT_MISMATCH");
  const request={
    kind:"WLE_PRIVATE_PREVIEW_INDEPENDENT_QA_V1",
    work_id:work.work_id, tenant_id:work.tenant_id,
    task_id:work.task_id, lease_id:work.lease.leaseId,
    source_sha:WLE_APPROVED_SOURCE_SHA,
    artifact_sha256:artifact.sha256, byte_size:artifact.byte_size,
    approved_template_sha256:artifact.approved_template_sha256,
    storage_bucket:"artifact-staging",
    storage_path:artifact.storage_path,
    expected_validator_id:config.validatorId,builder_id:config.workerId,
    required_checks:["private_bucket","read_authenticated_object_independently",
      "sha256","exact_byte_size","noindex","fictional_contractor_disclaimer",
      "tenant_lease_source_binding"],
    release:"PRIVATE_STAGING_ONLY",
    credentials_in_payload:false
  };
  let response:Response;
  try {
    response=await (config.fetchImpl??fetch)(config.endpoint,{
      method:"POST",redirect:"error",
      headers:{"content-type":"application/json",accept:"application/json",
        authorization:"Bearer "+config.bearerToken},
      body:JSON.stringify(request),
      signal:AbortSignal.timeout(config.timeoutMs??15000),
    });
  }catch{throw new Error("WLE_PRIVATE_QA_VALIDATOR_UNREACHABLE");}
  if(!response.ok)throw new Error("WLE_PRIVATE_QA_VALIDATOR_REJECTED_"+response.status);
  let proof:unknown;
  try{proof=await response.json();}catch{throw new Error("WLE_PRIVATE_QA_RESPONSE_INVALID");}
  if(!proof||typeof proof!=="object")throw new Error("WLE_PRIVATE_QA_RESPONSE_INVALID");
  const qa=proof as Partial<WlePrivateQaProof>;
  if(qa.kind!==request.kind || qa.status!=="PASS" ||
     qa.database_receipt_persisted!==true ||
     !RECEIPT.test(qa.receipt_id??"") ||
     qa.validator_id!==config.validatorId ||
     qa.validator_id===config.workerId ||
     qa.work_id!==work.work_id || qa.tenant_id!==work.tenant_id ||
     qa.task_id!==work.task_id || qa.lease_id!==work.lease.leaseId ||
     qa.source_sha!==WLE_APPROVED_SOURCE_SHA ||
     qa.artifact_sha256!==artifact.sha256 ||
     qa.byte_size!==artifact.byte_size ||
     qa.storage_path!==expectedPath ||
     qa.bucket_private!==true || qa.noindex!==true || qa.released!==false)
    throw new Error("WLE_PRIVATE_QA_INDEPENDENT_RECEIPT_MISMATCH");
  assertFreshLease(work);
  // The actual staging completion RPC must independently enforce the stored
  // validator receipt; HTTP PASS alone cannot establish a trusted release.
  return qa as WlePrivateQaProof;
}
