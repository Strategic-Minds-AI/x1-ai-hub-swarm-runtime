import type { LeasedWork } from "./types.js";

export interface SafeCodingDispatch {
  schema: "x1.coding.dispatch.v1";
  missionId: string;
  packetId: string;
  workId: string;
  tenantId: string;
  sourceSha: string;
  repo: "Strategic-Minds-AI/X1-OPERATING-SYSTEM";
  branch: string;
  objective: string;
  allowedPaths: string[];
  validation: string[];
  dryRun: true;
  requireIndependentValidation: true;
  prohibited: string[];
  idempotencyKey: string;
}

const PROHIBITED = [
  "merge_default_branch", "production_deploy", "dns_change", "secret_write",
  "paid_spend", "schema_migration", "customer_message", "public_publish",
  "self_approval", "unscoped_shell", "repository_transfer", "credential_export",
];

function nonblank(input:unknown, max:number, code:string):string {
  if(typeof input!=="string" || !input.trim() || input.length>max) throw new Error(code);
  return input.trim();
}
function paths(input:unknown):string[] {
  if(!Array.isArray(input) || input.length<1 || input.length>20) throw new Error("X1_CODING_PATHS_REQUIRED");
  return input.map((path:unknown)=>{
    const value=nonblank(path,160,"X1_CODING_PATH_INVALID");
    if(value.includes("..") || value.startsWith("/") || value.includes("\\") || !/^(src|tests|docs)\//.test(value)) {
      throw new Error("X1_CODING_PATH_FORBIDDEN");
    }
    return value;
  });
}
export function normalizeCodingWorkPacket(work:LeasedWork):SafeCodingDispatch {
  if(work.action_class!=="NON_PRODUCTION_MUTATION") throw new Error("X1_CODING_ACTION_CLASS_BLOCKED");
  if(work.payload.kind!=="X1_CODING_AGENT_V1") throw new Error("X1_CODING_PACKET_KIND_BLOCKED");
  if(!/^[0-9a-f]{64}$/.test(work.idempotency_key)) throw new Error("X1_CODING_IDEMPOTENCY_INVALID");
  const repo=nonblank(work.payload.repo,180,"X1_CODING_REPO_REQUIRED");
  if(repo!=="Strategic-Minds-AI/X1-OPERATING-SYSTEM") throw new Error("X1_CODING_REPO_NOT_AUTHORIZED");
  const sourceSha=nonblank(work.source_sha,40,"X1_CODING_SOURCE_REQUIRED");
  if(!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("X1_CODING_SOURCE_INVALID");
  const branch=nonblank(work.payload.branch,140,"X1_CODING_BRANCH_REQUIRED");
  if(!/^(feature|fix|research)\/[a-z0-9][a-z0-9./_-]*$/.test(branch) || branch.includes("..") || branch.endsWith("/")) {
    throw new Error("X1_CODING_BRANCH_BLOCKED");
  }
  const objective=nonblank(work.payload.objective,3500,"X1_CODING_OBJECTIVE_REQUIRED");
  if(work.approval_reference || work.payload.deploy || work.payload.merge || work.payload.budget_usd) {
    throw new Error("X1_CODING_PROTECTED_ACTION_BLOCKED");
  }
  const allowedPaths=paths(work.payload.allowed_paths);
  const validation=Array.isArray(work.payload.validation)
    ? work.payload.validation.map((v:unknown)=>nonblank(v,120,"X1_CODING_VALIDATION_INVALID"))
    : [];
  if(validation.length<1 || validation.length>20) throw new Error("X1_CODING_VALIDATION_REQUIRED");
  return {
    schema:"x1.coding.dispatch.v1",missionId:nonblank(work.mission_id,160,"X1_CODING_MISSION_REQUIRED"),
    packetId:nonblank(work.work_packet_id,160,"X1_CODING_PACKET_ID_REQUIRED"),
    workId:work.work_id,tenantId:work.tenant_id,sourceSha,
    repo:"Strategic-Minds-AI/X1-OPERATING-SYSTEM",branch,objective,
    allowedPaths,validation,dryRun:true,requireIndependentValidation:true,
    prohibited:PROHIBITED,idempotencyKey:work.idempotency_key
  };
}
