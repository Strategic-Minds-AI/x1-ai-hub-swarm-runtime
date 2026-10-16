import { createHash } from "node:crypto";
import type { BootstrapAuthorization, LeasedWork } from "./types.js";

/**
 * Bounded X1 artifact sync canary. Reuses the existing queue, signed
 * authorization, execution ledger, registry and worker loop.
 * NOT a new scheduler or a Google OAuth integration.
 */
export const X1_GPT_DRIVE_KIND = "X1_GPT_DRIVE_ARTIFACT_V1";
export const X1_GPT_DRIVE_CAPABILITY = "artifact-vault:gpt-downloads-create-only-v1";
export const X1_GPT_DRIVE_DESTINATION = "gpt-downloads-approved";
const SHA256 = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const FIELDS = new Set([
  "kind", "artifact_id", "project_id", "run_id", "producer_id", "filename",
  "mime_type", "byte_size", "sha256", "source_ref", "classification",
  "destination_key", "synthetic", "no_customer_data", "no_spend",
  "customer_outbound", "release_mode",
]);
const MAX_CANARY_BYTES = 64 * 1024;
function gate(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export interface GptDownloadsBinding {
  enabled: boolean;
  tenantId: string;
  projectId: string;
  accountEmail: string;
  driveId: string;
  intakeFolderId: string;
  receiptFolderId: string;
  approvedReference: string;
  allowedProducers: string[];
}
export interface GptDrivePlan {
  tenantId: string;
  projectId: string;
  runId: string;
  producerId: string;
  artifactId: string;
  filename: string;
  mimeType: "text/plain";
  sourceRef: string;
  sha256: string;
  byteSize: number;
  dedupeKey: string;
  driveId: string;
  intakeFolderId: string;
  receiptFolderId: string;
  accountEmail: string;
  approvalReference: string;
}
export interface VerifiedRemoteFile {
  fileId: string;
  parentId: string;
  driveId: string;
  sha256: string;
  byteSize: number;
  verifierId: string;
  verificationMethod: "remote_download_sha256";
}
export interface GptDriveProvider {
  readPrivateSource(plan: GptDrivePlan): Promise<Uint8Array>;
  scan(plan: GptDrivePlan, bytes: Uint8Array): Promise<{
    disposition: "STAGE" | "REVIEW" | "HOLD"; sha256: string;
  }>;
  findExisting(plan: GptDrivePlan): Promise<string | null>;
  createOnly(plan: GptDrivePlan, bytes: Uint8Array): Promise<{fileId: string}>;
  verifyByDownload(plan: GptDrivePlan, fileId: string): Promise<VerifiedRemoteFile>;
  storeReceipt(plan: GptDrivePlan, verified: VerifiedRemoteFile): Promise<boolean>;
}

/** Defense in depth: worker verifies the signed authorization separately. */
export function assertGptDriveSignedScope(
  work: LeasedWork, authorization: BootstrapAuthorization,
): void {
  if (work.payload?.kind !== X1_GPT_DRIVE_KIND) return;
  gate(work.action_class === "NON_PRODUCTION_MUTATION", "GPT_DRIVE_ACTION_CLASS_DENIED");
  gate(work.required_capabilities.length === 1 &&
    work.required_capabilities[0]?.id === X1_GPT_DRIVE_CAPABILITY &&
    work.required_capabilities[0]?.mechanism === "policy", "GPT_DRIVE_WORK_CAPABILITY_DENIED");
  gate(authorization.allowed === true &&
    authorization.tenant_id === work.tenant_id &&
    authorization.task_id === work.task_id &&
    authorization.requested_action === work.action_class &&
    authorization.capabilities_required.length === 1 &&
    authorization.capabilities_required[0] === X1_GPT_DRIVE_CAPABILITY &&
    authorization.capabilities_resolved.includes(X1_GPT_DRIVE_CAPABILITY) &&
    authorization.blockers.length === 0, "GPT_DRIVE_SIGNED_SCOPE_DENIED");
}

export function compileGptDrivePlan(
  work: LeasedWork, binding: GptDownloadsBinding,
  environment: string, workerId: string,
): GptDrivePlan {
  gate(environment === "preview", "GPT_DRIVE_PREVIEW_ENV_REQUIRED");
  gate(binding.enabled === true, "GPT_DRIVE_BINDING_DISABLED");
  gate(UUID.test(work.tenant_id) && work.tenant_id === binding.tenantId,
    "GPT_DRIVE_TENANT_MISMATCH");
  gate(work.action_class === "NON_PRODUCTION_MUTATION" &&
    /^x1\.artifact\.sync\.[a-z0-9-]{6,72}$/.test(work.task_id), "GPT_DRIVE_TASK_NOT_ALLOWLISTED");
  gate(work.lease?.taskId === work.task_id &&
    work.lease.holderAgentId === workerId &&
    Date.parse(work.lease.expiresAt) > Date.now() + 30000,
    "GPT_DRIVE_LEASE_INVALID");
  gate(SHA256.test(work.idempotency_key), "GPT_DRIVE_IDEMPOTENCY_INVALID");
  gate(work.approval_reference === binding.approvedReference &&
    typeof binding.approvedReference === "string" && binding.approvedReference.length > 8,
    "GPT_DRIVE_APPROVAL_MISMATCH");
  gate(typeof binding.accountEmail === "string" &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(binding.accountEmail) &&
    binding.driveId.length > 12 && binding.intakeFolderId.length > 12 &&
    binding.receiptFolderId.length > 12 &&
    binding.intakeFolderId !== binding.receiptFolderId,
    "GPT_DRIVE_BINDING_INVALID");
  const p = work.payload;
  gate(p && typeof p === "object" && !Array.isArray(p) &&
    Object.keys(p).every(key => FIELDS.has(key)), "GPT_DRIVE_PAYLOAD_UNEXPECTED");
  gate(p.kind === X1_GPT_DRIVE_KIND &&
    p.destination_key === X1_GPT_DRIVE_DESTINATION &&
    p.release_mode === "staging_only" &&
    p.synthetic === true && p.no_customer_data === true &&
    p.no_spend === true && p.customer_outbound === false,
    "GPT_DRIVE_POLICY_DENIED");
  const v = (key: string): string => typeof p[key] === "string" ? p[key] as string : "";
  for (const key of ["artifact_id", "project_id", "run_id", "producer_id", "filename"]) {
    gate(IDENTIFIER.test(v(key)) && !v(key).includes(".."), "GPT_DRIVE_IDENTITY_INVALID");
  }
  gate(v("project_id") === binding.projectId &&
    binding.allowedProducers.includes(v("producer_id")), "GPT_DRIVE_PROJECT_OR_PRODUCER_DENIED");
  gate(p.classification === "synthetic_test" && p.mime_type === "text/plain" &&
    v("filename").endsWith(".txt"), "GPT_DRIVE_CANARY_CLASSIFICATION_REQUIRED");
  gate(Number.isSafeInteger(p.byte_size) && (p.byte_size as number) > 0 &&
    (p.byte_size as number) <= MAX_CANARY_BYTES && SHA256.test(v("sha256")),
    "GPT_DRIVE_SIZE_OR_HASH_INVALID");
  const sourcePrefix = "artifact-staging/" + work.tenant_id + "/" +
    binding.projectId + "/" + v("artifact_id") + "/";
  gate(v("source_ref").startsWith(sourcePrefix) &&
    /^artifact-staging\/[A-Za-z0-9./_-]+$/.test(v("source_ref")) &&
    !v("source_ref").includes("..") && !v("source_ref").includes("//"),
    "GPT_DRIVE_SOURCE_REF_DENIED");
  return {
    tenantId: work.tenant_id, projectId: binding.projectId,
    runId: v("run_id"), producerId: v("producer_id"), artifactId: v("artifact_id"),
    filename: v("filename"), mimeType: "text/plain", sourceRef: v("source_ref"),
    sha256: v("sha256"), byteSize: p.byte_size as number,
    dedupeKey: work.idempotency_key, driveId: binding.driveId,
    intakeFolderId: binding.intakeFolderId, receiptFolderId: binding.receiptFolderId,
    accountEmail: binding.accountEmail, approvalReference: binding.approvedReference,
  };
}

export async function executeGptDriveSync(
  plan: GptDrivePlan, provider: GptDriveProvider,
): Promise<{status:"CONTENT_VERIFIED"; fileId:string; duplicate:boolean; sha256:string}> {
  const bytes = await provider.readPrivateSource(plan);
  gate(bytes instanceof Uint8Array && bytes.byteLength === plan.byteSize &&
    hash(bytes) === plan.sha256, "GPT_DRIVE_SOURCE_HASH_MISMATCH");
  const scan = await provider.scan(plan, bytes);
  gate(scan?.disposition === "STAGE" && scan.sha256 === plan.sha256,
    "GPT_DRIVE_SCAN_NOT_CLEARED");
  const existing = await provider.findExisting(plan);
  const fileId = existing ?? (await provider.createOnly(plan, bytes)).fileId;
  gate(typeof fileId === "string" && fileId.length > 8, "GPT_DRIVE_FILE_ID_MISSING");
  const remote = await provider.verifyByDownload(plan, fileId);
  gate(remote?.fileId === fileId && remote.parentId === plan.intakeFolderId &&
    remote.driveId === plan.driveId && remote.sha256 === plan.sha256 &&
    remote.byteSize === plan.byteSize &&
    remote.verificationMethod === "remote_download_sha256" &&
    remote.verifierId.length > 2, "GPT_DRIVE_REMOTE_VERIFICATION_FAILED");
  try {
    gate(await provider.storeReceipt(plan, remote), "GPT_DRIVE_RECEIPT_UNCONFIRMED");
  } catch {
    // Do not automatically replay an upload with an ambiguous receipt.
    throw new Error("GPT_DRIVE_RECEIPT_UNCONFIRMED");
  }
  return {status: "CONTENT_VERIFIED", fileId, duplicate: existing !== null,
    sha256: plan.sha256};
}
