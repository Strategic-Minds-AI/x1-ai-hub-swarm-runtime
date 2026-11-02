import { createHash } from "node:crypto";

export type WorkerExecutionPlane = "jarvis-local" | "local-ollama" | "railway" | "validator" | "cloud";
export type WorkerRuntimeEnvironment = "development" | "preview" | "production";
export type WorkerActionClass = "READ_ONLY" | "NON_PRODUCTION_MUTATION" | "PROTECTED_MUTATION" | "PRODUCTION_RELEASE";

export interface WorkerIdentityInput {
  workerId: string;
  tenantId: string;
  executionPlane: WorkerExecutionPlane;
  environment: WorkerRuntimeEnvironment;
  identityVersion: string;
  artifactDigest: string;
  credentialId: string;
  allowedActionClasses: WorkerActionClass[];
  allowedCapabilities?: string[];
}

export interface RegisteredWorkerIdentity extends WorkerIdentityInput {
  allowedCapabilities: string[];
  identityFingerprint: string;
}

const WORKER_ID=/^[a-z0-9][a-z0-9._-]{2,127}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256=/^sha256:[0-9a-f]{64}$/;
const TEXT=/^[A-Za-z0-9][A-Za-z0-9._:@/+\-]{0,127}$/;

function uniqueSorted(values:string[]):string[] {
  return [...new Set(values.map(v=>v.trim()).filter(Boolean))].sort();
}

function assertText(value:string,label:string):string {
  const clean=value.trim();
  if(!TEXT.test(clean)) throw new Error(`WORKER_IDENTITY_${label}_INVALID`);
  return clean;
}

export function buildWorkerIdentity(input:WorkerIdentityInput):RegisteredWorkerIdentity {
  const workerId=input.workerId.trim();
  const tenantId=input.tenantId.trim();
  const artifactDigest=input.artifactDigest.trim().toLowerCase();
  if(!WORKER_ID.test(workerId)) throw new Error("WORKER_IDENTITY_WORKER_ID_INVALID");
  if(!UUID.test(tenantId)) throw new Error("WORKER_IDENTITY_TENANT_ID_INVALID");
  if(!SHA256.test(artifactDigest)) throw new Error("WORKER_IDENTITY_ARTIFACT_DIGEST_INVALID");

  const allowedActionClasses=uniqueSorted(input.allowedActionClasses) as WorkerActionClass[];
  if(allowedActionClasses.length===0) throw new Error("WORKER_IDENTITY_ACTION_CLASSES_REQUIRED");
  const allowedCapabilities=uniqueSorted(input.allowedCapabilities ?? []);

  const normalized={
    workerId,
    tenantId,
    executionPlane:input.executionPlane,
    environment:input.environment,
    identityVersion:assertText(input.identityVersion,"VERSION"),
    artifactDigest,
    credentialId:assertText(input.credentialId,"CREDENTIAL_ID"),
    allowedActionClasses,
    allowedCapabilities,
  };

  const canonical=JSON.stringify({
    worker_id:normalized.workerId,
    tenant_id:normalized.tenantId,
    execution_plane:normalized.executionPlane,
    environment:normalized.environment,
    identity_version:normalized.identityVersion,
    artifact_digest:normalized.artifactDigest,
    credential_id:normalized.credentialId,
    allowed_action_classes:normalized.allowedActionClasses,
    allowed_capabilities:normalized.allowedCapabilities,
  });
  const identityFingerprint=createHash("sha256").update(canonical).digest("hex");

  return {...normalized,identityFingerprint};
}

export function workerIdentityAssertionBody(identity:RegisteredWorkerIdentity):Record<string,unknown> {
  return {
    p_worker_id:identity.workerId,
    p_tenant_id:identity.tenantId,
    p_environment:identity.environment,
    p_execution_plane:identity.executionPlane,
    p_identity_version:identity.identityVersion,
    p_identity_fingerprint:identity.identityFingerprint,
    p_artifact_digest:identity.artifactDigest,
    p_credential_id:identity.credentialId,
  };
}
