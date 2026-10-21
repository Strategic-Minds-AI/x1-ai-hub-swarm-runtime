// X1 preview pipeline adapter.
//
// The NON_PRODUCTION_MUTATION handler the preview worker is missing, written so it
// cannot weaken the gates that already exist. Every gate runs BEFORE any artifact is
// produced, and the two receipts it depends on are read back from the ledger by an
// authenticated call, never taken from the caller: this module has no parameter that
// accepts a receipt. PREVIEW_READY additionally requires verified deployment evidence
// whose URL answered 200 on an allowlisted host. Fail-closed: every gate defaults to
// refusal, and an unconfigured allowlist can never produce a ready preview.
//
// Self-contained on purpose: no imports, so type stripping, tsc and the compiled dist
// build all resolve it without any cross-module type dependency.

export const PREVIEW_ACTION_CLASS = "NON_PRODUCTION_MUTATION";

// A builder or worker identity may never issue the QA or Guardian receipt that
// certifies its own output, whatever name it presents.
export const DENIED_RECEIPT_ISSUERS = ["base44-builder", "base44-superagent", "x1-p0-controlled-worker-restoration", "x1-swarm-production"];
export const VALIDATOR_IDENTITY_PREFIXES = ["guardian-", "vision-cortex-"];
export const VALIDATOR_CREDENTIAL_CLASS = "VALIDATOR";

// The launch engine emits this schema and a sha256 digest, so the runtime verifies
// sha256 and never a 40-hex commit id in its place.
export const BUILD_MANIFEST_SCHEMA = "strategic-minds/sitepack-build-manifest/v1";
export const REQUIRED_MANIFEST_KEYS = ["schema", "sitepack_id", "industry_slug", "phase", "target_environment", "noindex", "sitemap", "lead_mode", "source_sha", "gates", "artifact_digest", "files"];
export const REQUIRED_MANIFEST_GATES = ["noindex_enforced", "preview_target_enforced", "lead_endpoint_staging_fenced", "production_reference_absent", "source_sha_pinned", "synthetic_label_required"];
export const RECEIPT_TYPES = { QA: "independent_qa", GUARDIAN: "independent_validation" };
// A preview build can only be certified by a website-artifact validation. Execution-evidence
// validation (a READ_ONLY run, which has no artifact at all) is a different class and is never
// accepted here, whatever else the receipt carries.
export const WEBSITE_ARTIFACT_KIND = "website_artifact";

export const PREVIEW_CODES = Object.freeze({
  FEATURE_DISABLED: "PREVIEW_FEATURE_DISABLED",
  ENV_NOT_PREVIEW: "PREVIEW_ENV_NOT_PREVIEW",
  ACTION_UNSUPPORTED: "PREVIEW_ACTION_CLASS_UNSUPPORTED",
  NOINDEX_REQUIRED: "PREVIEW_NOINDEX_REQUIRED",
  TARGET_NOT_PREVIEW: "PREVIEW_TARGET_NOT_PREVIEW",
  TENANT_MISMATCH: "PREVIEW_TENANT_MISMATCH",
  DB_REF_REQUIRED: "PREVIEW_DB_REF_REQUIRED",
  DB_REF_NOT_STAGING: "PREVIEW_DB_REF_NOT_STAGING",
  PRODUCTION_FENCE: "PREVIEW_PRODUCTION_FENCE_VIOLATION",
  BUILD_MANIFEST_INVALID: "PREVIEW_BUILD_MANIFEST_INVALID",
  BUILD_SHA_MISMATCH: "PREVIEW_BUILD_SHA_MISMATCH",
  QA_MISSING: "PREVIEW_QA_RECEIPT_MISSING",
  QA_INVALID: "PREVIEW_QA_RECEIPT_INVALID",
  GUARDIAN_MISSING: "PREVIEW_GUARDIAN_RECEIPT_MISSING",
  GUARDIAN_INVALID: "PREVIEW_GUARDIAN_RECEIPT_INVALID",
  GUARDIAN_KIND_INVALID: "PREVIEW_GUARDIAN_KIND_INVALID",
  RECEIPT_TASK_MISMATCH: "PREVIEW_RECEIPT_TASK_MISMATCH",
  RECEIPT_TENANT_MISMATCH: "PREVIEW_RECEIPT_TENANT_MISMATCH",
  RECEIPT_ARTIFACT_MISMATCH: "PREVIEW_RECEIPT_ARTIFACT_MISMATCH",
  READBACK_FAILED: "PREVIEW_READBACK_FAILED",
  DEPLOY_NOT_AUTHORIZED: "PREVIEW_DEPLOY_NOT_AUTHORIZED",
  DEPLOY_UNVERIFIED: "PREVIEW_DEPLOY_UNVERIFIED"
});

export interface PreviewRuntimeContext {
  runtime_env: string;
  system_tenant_id: string;
  preview_enabled: boolean;
  staging_supabase_ref: string;
  production_supabase_ref: string;
  source_sha: string | null;
}

export interface PreviewWork {
  work_id: string;
  task_id: string;
  tenant_id: string;
  requested_by: string;
  action_class: string;
  source_sha: string | null;
  payload: Record<string, unknown>;
}

export interface BuildManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface BuildManifest {
  schema: string;
  sitepack_id: string;
  source_sha: string;
  artifact_digest: string;
  noindex: boolean;
  lead_mode: string;
  gates: Record<string, unknown>;
  files: BuildManifestFile[];
  [key: string]: unknown;
}

export interface ReceiptRow {
  receipt_id: string;
  receipt_type: string;
  tenant_id: string;
  source_system: string;
  source_sha: string;
  payload?: Record<string, unknown>;
  created_at?: string;
}

export interface PreviewReceiptReader {
  readTaskReceipts(ref: { tenant_id: string; task_id: string }): Promise<ReceiptRow[]>;
}

export interface DeploymentEvidence {
  url: string;
  artifact_digest: string;
  deployed_at?: string;
}

export interface DeploymentProbe {
  reachable: boolean;
  http_status: number;
  checked_at: string;
}

export interface PreviewArtifactDeployment {
  url: string;
  artifact_digest: string;
  http_status: number;
  checked_at: string;
  verified: true;
}

export interface GateResult {
  ok: boolean;
  code: string;
  reason: string;
}

export interface PreviewArtifact {
  task_id: string;
  tenant_id: string;
  sitepack_id: string;
  build_manifest_digest: string;
  status: "PREPARED_NOT_DEPLOYED" | "PREVIEW_READY";
  preview_url: string | null;
  source_sha: string | null;
  noindex: true;
  rollback_reference: string;
  qa_receipt_id: string;
  guardian_receipt_id: string;
  deployment_evidence: PreviewArtifactDeployment | null;
  production_touched: false;
}

export interface PreviewHandlerDeps {
  context: PreviewRuntimeContext;
  workerIdentity: string;
  receipts: PreviewReceiptReader;
  deployAuthorized: boolean;
  previewHostAllowlist: string[];
  deployPreview?: (manifest: BuildManifest, work: PreviewWork) => Promise<DeploymentEvidence | null>;
  probePreviewUrl?: (url: string) => Promise<DeploymentProbe | null>;
}

export interface PreviewHandlerResult {
  ok: boolean;
  code: string;
  reason: string;
  artifact?: PreviewArtifact;
}

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function deny(code: string, reason: string): GateResult { return { ok: false, code: code, reason: reason }; }
function permit(code: string, reason: string): GateResult { return { ok: true, code: code, reason: reason }; }
function messageOf(error: unknown): string { return error instanceof Error ? error.message : "unknown error"; }
function hasOwn(value: object, key: string): boolean { return Object.prototype.hasOwnProperty.call(value, key); }

function payloadOf(row: ReceiptRow): Record<string, unknown> {
  return row.payload && typeof row.payload === "object" ? row.payload : {};
}
function stringField(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value : "";
}
function decisionOf(row: ReceiptRow): string { return stringField(payloadOf(row), "decision"); }
function taskIdOf(row: ReceiptRow): string { return stringField(payloadOf(row), "task_id"); }
function tenantIdOf(row: ReceiptRow): string { return stringField(payloadOf(row), "tenant_id") || String(row.tenant_id ?? ""); }
function artifactOf(row: ReceiptRow): string { return stringField(payloadOf(row), "artifact_digest"); }
function issuerOf(row: ReceiptRow): string { return stringField(payloadOf(row), "validator_identity") || String(row.source_system ?? ""); }
function credentialClassOf(row: ReceiptRow): string { return stringField(payloadOf(row), "validator_credential_class"); }

export function evaluateFeatureGate(context: PreviewRuntimeContext, work: PreviewWork): GateResult {
  if (context.runtime_env !== "preview") return deny(PREVIEW_CODES.ENV_NOT_PREVIEW, "the preview pipeline only runs in the preview runtime");
  if (context.preview_enabled !== true) return deny(PREVIEW_CODES.FEATURE_DISABLED, "the preview pipeline is disabled until it is explicitly enabled");
  if (work.action_class !== PREVIEW_ACTION_CLASS) return deny(PREVIEW_CODES.ACTION_UNSUPPORTED, "only " + PREVIEW_ACTION_CLASS + " work reaches the preview handler");
  if (String(work.tenant_id) !== String(context.system_tenant_id)) return deny(PREVIEW_CODES.TENANT_MISMATCH, "the work item belongs to another tenant");
  if (work.payload.noindex !== true) return deny(PREVIEW_CODES.NOINDEX_REQUIRED, "a preview artifact must be noindex");
  if (work.payload.target_environment !== "preview") return deny(PREVIEW_CODES.TARGET_NOT_PREVIEW, "the work item does not target the preview environment");
  return permit("PREVIEW_FEATURE_GATE_PASSED", "preview runtime, enabled feature, noindex preview work on the system tenant");
}

function deepContains(value: unknown, needle: string): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.indexOf(needle) !== -1;
  if (Array.isArray(value)) return value.some(function (entry) { return deepContains(entry, needle); });
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).some(function (key) { return deepContains((value as Record<string, unknown>)[key], needle); });
  return false;
}

export function evaluateDatabaseFencing(context: PreviewRuntimeContext, work: PreviewWork): GateResult {
  const ref = String(work.payload.supabase_ref || "");
  if (!ref) return deny(PREVIEW_CODES.DB_REF_REQUIRED, "the work item must name the database it writes to");
  if (context.production_supabase_ref && ref === context.production_supabase_ref) return deny(PREVIEW_CODES.PRODUCTION_FENCE, "the work item targets the production database");
  if (!context.staging_supabase_ref || ref !== context.staging_supabase_ref) return deny(PREVIEW_CODES.DB_REF_NOT_STAGING, "the work item must target the staging database");
  if (context.production_supabase_ref && deepContains(work.payload, context.production_supabase_ref)) {
    return deny(PREVIEW_CODES.PRODUCTION_FENCE, "the payload references the production database anywhere");
  }
  return permit("PREVIEW_DB_FENCE_PASSED", "the payload is fenced to the staging database");
}

export function verifyBuildManifest(manifest: BuildManifest | undefined, work: PreviewWork, context: PreviewRuntimeContext): GateResult {
  if (!manifest || typeof manifest !== "object") return deny(PREVIEW_CODES.BUILD_MANIFEST_INVALID, "the work item carries no launch engine build manifest");
  for (const key of REQUIRED_MANIFEST_KEYS) {
    if (!hasOwn(manifest, key)) return deny(PREVIEW_CODES.BUILD_MANIFEST_INVALID, "the build manifest is missing " + key);
  }
  if (manifest.schema !== BUILD_MANIFEST_SCHEMA) return deny(PREVIEW_CODES.BUILD_MANIFEST_INVALID, "the build manifest schema is not " + BUILD_MANIFEST_SCHEMA);
  if (manifest.noindex !== true) return deny(PREVIEW_CODES.BUILD_MANIFEST_INVALID, "the build manifest does not record a noindex artifact");
  if (!SHA40.test(String(manifest.source_sha || ""))) return deny(PREVIEW_CODES.BUILD_MANIFEST_INVALID, "the build manifest source SHA is not 40-hex");
  if (!SHA256.test(String(manifest.artifact_digest || ""))) {
    return deny(PREVIEW_CODES.BUILD_MANIFEST_INVALID, "the build manifest artifact digest is not a 64-hex sha256: the launch engine emits sha256, not a 40-hex commit id");
  }
  if (String(manifest.source_sha) !== String(work.source_sha || "")) return deny(PREVIEW_CODES.BUILD_SHA_MISMATCH, "the build manifest was built from a different source SHA than the work item");
  if (context.source_sha && String(manifest.source_sha) !== String(context.source_sha)) {
    return deny(PREVIEW_CODES.BUILD_SHA_MISMATCH, "the build manifest was built from a different source SHA than the running worker");
  }
  const gates = manifest.gates && typeof manifest.gates === "object" ? manifest.gates : {};
  for (const key of REQUIRED_MANIFEST_GATES) {
    if (gates[key] !== true) return deny(PREVIEW_CODES.BUILD_MANIFEST_INVALID, "the build manifest does not record the " + key + " gate");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) return deny(PREVIEW_CODES.BUILD_MANIFEST_INVALID, "the build manifest lists no artifact files");
  for (const file of manifest.files) {
    if (!file || typeof file.path !== "string" || file.path.length === 0) return deny(PREVIEW_CODES.BUILD_MANIFEST_INVALID, "an artifact file entry has no path");
    if (!SHA256.test(String(file.sha256 || ""))) return deny(PREVIEW_CODES.BUILD_MANIFEST_INVALID, "artifact file " + file.path + " carries no 64-hex sha256");
    if (typeof file.bytes !== "number" || file.bytes <= 0) return deny(PREVIEW_CODES.BUILD_MANIFEST_INVALID, "artifact file " + file.path + " carries no byte count");
  }
  return permit("PREVIEW_BUILD_MANIFEST_VERIFIED", "the launch engine manifest is intact, pinned to this SHA and carries every required gate");
}

function independentIssuer(work: PreviewWork, workerIdentity: string, identity: string): boolean {
  if (!identity) return false;
  if (identity === workerIdentity) return false;
  if (identity === work.requested_by) return false;
  return DENIED_RECEIPT_ISSUERS.indexOf(identity) === -1;
}

function commonReceiptChecks(row: ReceiptRow, work: PreviewWork, manifestDigest: string): GateResult | null {
  if (taskIdOf(row) !== work.task_id) return deny(PREVIEW_CODES.RECEIPT_TASK_MISMATCH, "the receipt was issued for a different task");
  if (tenantIdOf(row) !== work.tenant_id) return deny(PREVIEW_CODES.RECEIPT_TENANT_MISMATCH, "the receipt was issued for a different tenant");
  if (artifactOf(row) !== manifestDigest) return deny(PREVIEW_CODES.RECEIPT_ARTIFACT_MISMATCH, "the receipt is not bound to this build manifest digest");
  if (String(row.source_sha || "") !== String(work.source_sha || "")) return deny(PREVIEW_CODES.RECEIPT_ARTIFACT_MISMATCH, "the receipt was issued against a different source SHA");
  return null;
}

export function evaluateIndependentQaGate(rows: ReceiptRow[], work: PreviewWork, manifestDigest: string, workerIdentity: string): GateResult {
  const row = rows.find(function (entry) { return entry.receipt_type === RECEIPT_TYPES.QA; });
  if (!row || !row.receipt_id) return deny(PREVIEW_CODES.QA_MISSING, "no independent QA receipt was read back for this task");
  const mismatch = commonReceiptChecks(row, work, manifestDigest);
  if (mismatch) return mismatch;
  if (decisionOf(row) !== "PASS") return deny(PREVIEW_CODES.QA_INVALID, "the QA decision is not PASS");
  if (!independentIssuer(work, workerIdentity, issuerOf(row))) return deny(PREVIEW_CODES.QA_INVALID, "the QA receipt was issued by the worker, the requester or a builder identity");
  return permit("PREVIEW_QA_GATE_PASSED", "an independent QA receipt bound to this task and artifact digest was read back");
}

export function evaluateGuardianGate(rows: ReceiptRow[], work: PreviewWork, manifestDigest: string, workerIdentity: string): GateResult {
  const row = rows.find(function (entry) { return entry.receipt_type === RECEIPT_TYPES.GUARDIAN; });
  if (!row || !row.receipt_id) return deny(PREVIEW_CODES.GUARDIAN_MISSING, "no independent validation receipt was read back for this task");
  const mismatch = commonReceiptChecks(row, work, manifestDigest);
  if (mismatch) return mismatch;
  const identity = issuerOf(row);
  const payloadIdentity = stringField(payloadOf(row), "validator_identity");
  if (!payloadIdentity || payloadIdentity !== String(row.source_system ?? "")) {
    return deny(PREVIEW_CODES.GUARDIAN_INVALID, "the receipt identity and its issuer row disagree, so it is treated as forged");
  }
  const inValidatorClass = VALIDATOR_IDENTITY_PREFIXES.some(function (prefix) { return identity.indexOf(prefix) === 0; });
  if (!inValidatorClass) return deny(PREVIEW_CODES.GUARDIAN_INVALID, "the receipt was not issued by an independent validator class identity");
  if (credentialClassOf(row) !== VALIDATOR_CREDENTIAL_CLASS) return deny(PREVIEW_CODES.GUARDIAN_INVALID, "the issuer is not a VALIDATOR-class credential");
  if (decisionOf(row) !== "PASS") return deny(PREVIEW_CODES.GUARDIAN_INVALID, "the Guardian decision is not PASS");
  if (!independentIssuer(work, workerIdentity, identity)) return deny(PREVIEW_CODES.GUARDIAN_INVALID, "the Guardian receipt was issued by the worker, the requester or a builder identity");
  const payload = payloadOf(row);
  if (stringField(payload, "validation_kind") !== WEBSITE_ARTIFACT_KIND) {
    return deny(PREVIEW_CODES.GUARDIAN_KIND_INVALID, "the receipt is not an explicit website_artifact validation, so it cannot certify a preview build");
  }
  const build = payload.build_evidence;
  if (!build || typeof build !== "object") return deny(PREVIEW_CODES.GUARDIAN_KIND_INVALID, "the receipt carries no build evidence for the artifact it certifies");
  if (String((build as Record<string, unknown>).artifact_digest || "") !== manifestDigest) {
    return deny(PREVIEW_CODES.GUARDIAN_KIND_INVALID, "the receipt build evidence names a different artifact digest than the build manifest");
  }
  if (String((build as Record<string, unknown>).source_sha || "") !== String(work.source_sha || "")) {
    return deny(PREVIEW_CODES.GUARDIAN_KIND_INVALID, "the receipt build evidence was produced from a different source SHA than the work item");
  }
  const fileCount = Number((build as Record<string, unknown>).file_count);
  if (!Number.isFinite(fileCount) || fileCount < 1) {
    return deny(PREVIEW_CODES.GUARDIAN_KIND_INVALID, "the receipt build evidence names no emitted file");
  }
  return permit("PREVIEW_GUARDIAN_GATE_PASSED", "an independent VALIDATOR-class website_artifact receipt bound to this task, artifact digest and build evidence was read back");
}

function hostOf(url: string): string {
  if (url.indexOf("https://") !== 0) return "";
  const rest = url.slice(8);
  const authority = rest.split("/")[0] ?? "";
  return (authority.split(":")[0] ?? "").toLowerCase();
}

export function verifyDeploymentEvidence(deployed: DeploymentEvidence | null, probe: DeploymentProbe | null, allowlist: string[]): GateResult {
  if (!deployed || !deployed.url) return deny(PREVIEW_CODES.DEPLOY_UNVERIFIED, "no deployment evidence was produced, so nothing can be reported ready");
  if (!SHA256.test(String(deployed.artifact_digest || ""))) return deny(PREVIEW_CODES.DEPLOY_UNVERIFIED, "the deployment evidence does not name an artifact digest");
  const host = hostOf(deployed.url);
  if (!host) return deny(PREVIEW_CODES.DEPLOY_UNVERIFIED, "the preview URL is not an https URL");
  if (!Array.isArray(allowlist) || allowlist.length === 0) {
    return deny(PREVIEW_CODES.DEPLOY_UNVERIFIED, "no preview host allowlist is configured, so no URL can be proven to be the preview");
  }
  if (allowlist.indexOf(host) === -1) return deny(PREVIEW_CODES.DEPLOY_UNVERIFIED, "the preview URL host is not in the configured allowlist");
  if (!probe || probe.reachable !== true) return deny(PREVIEW_CODES.DEPLOY_UNVERIFIED, "the preview URL could not be reached");
  if (Number(probe.http_status) !== 200) return deny(PREVIEW_CODES.DEPLOY_UNVERIFIED, "the preview URL answered " + String(probe.http_status) + " instead of 200");
  return permit("PREVIEW_DEPLOY_VERIFIED", "the preview URL answered 200 on an allowlisted host for this artifact");
}

export function buildPreviewArtifact(work: PreviewWork, manifest: BuildManifest, qa: ReceiptRow, guardian: ReceiptRow, status: "PREPARED_NOT_DEPLOYED" | "PREVIEW_READY", deployment: PreviewArtifactDeployment | null): PreviewArtifact {
  return {
    task_id: work.task_id,
    tenant_id: work.tenant_id,
    sitepack_id: String(manifest.sitepack_id),
    build_manifest_digest: String(manifest.artifact_digest),
    status: status,
    preview_url: deployment ? deployment.url : null,
    source_sha: work.source_sha,
    noindex: true,
    rollback_reference: "no rollback required: preview build only, no production write. If the preview must be withdrawn, remove the preview deployment; the queue row, its lease and its receipts stay as audit evidence.",
    qa_receipt_id: qa.receipt_id,
    guardian_receipt_id: guardian.receipt_id,
    deployment_evidence: deployment,
    production_touched: false
  };
}

export function createPreviewHandler(deps: PreviewHandlerDeps) {
  return async function handle(work: PreviewWork): Promise<PreviewHandlerResult> {
    const manifest = work.payload.build_manifest as BuildManifest | undefined;
    const gates = [evaluateFeatureGate(deps.context, work), evaluateDatabaseFencing(deps.context, work), verifyBuildManifest(manifest, work, deps.context)];
    for (const gate of gates) {
      if (!gate.ok) return { ok: false, code: gate.code, reason: gate.reason };
    }
    const verified = manifest as BuildManifest;

    let rows: ReceiptRow[];
    try {
      rows = await deps.receipts.readTaskReceipts({ tenant_id: work.tenant_id, task_id: work.task_id });
    } catch (error) {
      return { ok: false, code: PREVIEW_CODES.READBACK_FAILED, reason: "the authenticated receipt readback failed, so nothing can be certified: " + messageOf(error) };
    }
    if (!Array.isArray(rows)) return { ok: false, code: PREVIEW_CODES.READBACK_FAILED, reason: "the receipt readback returned no receipt list" };

    const qaGate = evaluateIndependentQaGate(rows, work, String(verified.artifact_digest), deps.workerIdentity);
    if (!qaGate.ok) return { ok: false, code: qaGate.code, reason: qaGate.reason };
    const guardianGate = evaluateGuardianGate(rows, work, String(verified.artifact_digest), deps.workerIdentity);
    if (!guardianGate.ok) return { ok: false, code: guardianGate.code, reason: guardianGate.reason };

    const qaRow = rows.find(function (entry) { return entry.receipt_type === RECEIPT_TYPES.QA; }) as ReceiptRow;
    const guardianRow = rows.find(function (entry) { return entry.receipt_type === RECEIPT_TYPES.GUARDIAN; }) as ReceiptRow;
    const prepared = buildPreviewArtifact(work, verified, qaRow, guardianRow, "PREPARED_NOT_DEPLOYED", null);

    if (deps.deployAuthorized !== true) {
      return { ok: true, code: PREVIEW_CODES.DEPLOY_NOT_AUTHORIZED, reason: "every gate passed; the artifact is prepared but not deployed, and no preview is claimed", artifact: prepared };
    }
    if (!deps.deployPreview) {
      return { ok: true, code: PREVIEW_CODES.DEPLOY_UNVERIFIED, reason: "every gate passed but no authorized staging deployer is wired, so nothing was deployed", artifact: prepared };
    }
    const deployed = await deps.deployPreview(verified, work);
    if (!deployed || String(deployed.artifact_digest || "") !== String(verified.artifact_digest)) {
      return { ok: true, code: PREVIEW_CODES.DEPLOY_UNVERIFIED, reason: "the deployment evidence does not name this artifact digest, so the preview is not reported ready", artifact: prepared };
    }
    const probe = deps.probePreviewUrl ? await deps.probePreviewUrl(deployed.url) : null;
    const evidence = verifyDeploymentEvidence(deployed, probe, deps.previewHostAllowlist);
    if (!evidence.ok) return { ok: true, code: evidence.code, reason: evidence.reason, artifact: prepared };
    const checkedAt = probe && probe.checked_at ? probe.checked_at : "";
    const httpStatus = probe ? Number(probe.http_status) : 0;
    const ready = buildPreviewArtifact(work, verified, qaRow, guardianRow, "PREVIEW_READY", {
      url: deployed.url,
      artifact_digest: String(deployed.artifact_digest),
      http_status: httpStatus,
      checked_at: checkedAt,
      verified: true
    });
    return { ok: true, code: "PREVIEW_READY", reason: evidence.reason, artifact: ready };
  };
}
