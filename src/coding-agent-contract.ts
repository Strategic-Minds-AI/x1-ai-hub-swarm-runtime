import type { LeasedWork } from "./types.js";

export interface SafeCodingDispatch {
  schema: "x1.coding.dispatch.v1";
  missionId: string;
  packetId: string;
  workId: string;
  tenantId: string;
  sourceSha: string;
  repo: "Strategic-Minds-AI/X1-OPERATING-SYSTEM" | "Strategic-Minds-AI/eden-universal-mcp-factory";
  branch: string;
  objective: string;
  allowedPaths: string[];
  validation: string[];
  dryRun: true;
  requireIndependentValidation: true;
  prohibited: string[];
  idempotencyKey: string;
}

// The factory exception is limited to ONE already-existing draft branch, one
// immutable source revision, one synthetic task and one path. This source
// change alone never grants worker permission or deploys a runtime.
export const EDEN_FACTORY_CANARY = Object.freeze({
  kind: "EDEN_FACTORY_CANARY_V1",
  repo: "Strategic-Minds-AI/eden-universal-mcp-factory",
  tenant: "666f23bf-61bd-4be0-b5cb-4872e04fad9b",
  mission: "EDEN-UNIVERSAL-MCP-FACTORY-20261114",
  task: "eden.factory.canary.20261114",
  sourceSha: "72b0b78afa6ebf0dc6693683ee0a9a20d618baa9",
  idempotencyKey: "7ab67b1524eb880c2bc3437c9350dadb756a002d1f45a3dea0b19d56737f7a6a",
  worker: "x1-swarm-preview-1",
  branch: "feature/eden-autocode-reconciler-20261114",
  path: "tests/x1-worker-canary.test.mjs",
  capability: "x1:eden-factory-canary:v1",
});

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
  const factory=work.payload.kind===EDEN_FACTORY_CANARY.kind;
  if(work.payload.kind!=="X1_CODING_AGENT_V1" && !factory) throw new Error("X1_CODING_PACKET_KIND_BLOCKED");
  if(!/^[0-9a-f]{64}$/.test(work.idempotency_key)) throw new Error("X1_CODING_IDEMPOTENCY_INVALID");
  const repo=nonblank(work.payload.repo,180,"X1_CODING_REPO_REQUIRED");
  if(repo!=="Strategic-Minds-AI/X1-OPERATING-SYSTEM" && repo!==EDEN_FACTORY_CANARY.repo)
    throw new Error("X1_CODING_REPO_NOT_AUTHORIZED");
  // Never route ordinary X1_CODING_AGENT_V1 packets to the factory repository.
  if((factory && repo!==EDEN_FACTORY_CANARY.repo) ||
     (!factory && repo!== "Strategic-Minds-AI/X1-OPERATING-SYSTEM"))
    throw new Error("X1_CODING_FACTORY_KIND_REPO_MISMATCH");
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
  if(factory) {
    const F=EDEN_FACTORY_CANARY;
    const cap=work.required_capabilities;
    const permittedFields=new Set(["kind","repo","branch","objective","allowed_paths","validation",
      "synthetic","no_spend","no_customer_data","customer_outbound","production_release"]);
    if(work.tenant_id!==F.tenant || work.mission_id!==F.mission ||
       work.task_id!==F.task || work.source_sha!==F.sourceSha ||
       work.idempotency_key!==F.idempotencyKey || work.attempt!==1 ||
       work.lease?.holderAgentId!==F.worker || work.lease?.taskId!==F.task ||
       repo!==F.repo || branch!==F.branch ||
       allowedPaths.length!==1 || allowedPaths[0]!==F.path ||
       validation.length!==1 || validation[0]!=="unit" ||
       !Array.isArray(cap) || cap.length!==1 ||
       cap[0]?.id!==F.capability || cap[0]?.mechanism!=="policy" ||
       work.payload.synthetic!==true || work.payload.no_spend!==true ||
       work.payload.no_customer_data!==true ||
       work.payload.customer_outbound!==false ||
       work.payload.production_release!==false ||
       Object.keys(work.payload).some(k=>!permittedFields.has(k))) {
      throw new Error("X1_EDEN_CANARY_SCOPE_DENIED");
    }
  }
  return {
    schema:"x1.coding.dispatch.v1",missionId:nonblank(work.mission_id,160,"X1_CODING_MISSION_REQUIRED"),
    packetId:nonblank(work.work_packet_id,160,"X1_CODING_PACKET_ID_REQUIRED"),
    workId:work.work_id,tenantId:work.tenant_id,sourceSha,
    repo:factory ? EDEN_FACTORY_CANARY.repo : "Strategic-Minds-AI/X1-OPERATING-SYSTEM",branch,objective,
    allowedPaths,validation,dryRun:true,requireIndependentValidation:true,
    prohibited:PROHIBITED,idempotencyKey:work.idempotency_key
  };
}
