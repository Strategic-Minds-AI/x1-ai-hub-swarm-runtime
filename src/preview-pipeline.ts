// X1 preview pipeline adapter.
//
// The NON_PRODUCTION_MUTATION handler the preview worker is missing, written so it
// cannot weaken the gates that already exist: the feature gate, the staging database
// fence, the independent-QA gate and the Guardian receipt gate all run BEFORE any
// artifact is produced, and deployment stays refused until a staging deployment is
// explicitly authorized. Fail-closed: every gate defaults to refusal.
//
// Self-contained on purpose: no imports, so type stripping, tsc and the compiled
// dist build all resolve it without any cross-module type dependency.

export const PREVIEW_ACTION_CLASS = "NON_PRODUCTION_MUTATION";

// A builder or worker identity may never issue the QA or Guardian receipt that
// certifies its own output, whatever name it presents.
export const DENIED_RECEIPT_ISSUERS = ["base44-builder", "base44-superagent", "x1-p0-controlled-worker-restoration"];

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
  QA_MISSING: "PREVIEW_QA_RECEIPT_MISSING",
  QA_NOT_PASS: "PREVIEW_QA_NOT_PASS",
  QA_NOT_INDEPENDENT: "PREVIEW_QA_NOT_INDEPENDENT",
  QA_SHA_MISMATCH: "PREVIEW_QA_SHA_MISMATCH",
  GUARDIAN_NOT_INDEPENDENT: "PREVIEW_GUARDIAN_NOT_INDEPENDENT",
  GUARDIAN_NOT_PASS: "PREVIEW_GUARDIAN_NOT_PASS",
  DEPLOY_NOT_AUTHORIZED: "PREVIEW_DEPLOY_NOT_AUTHORIZED",
  BUILD_DIGEST_REQUIRED: "PREVIEW_BUILD_DIGEST_REQUIRED"
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

export interface PreviewQaReceipt {
  receipt_id: string;
  verdict: string;
  source_system: string;
  source_sha: string | null;
}

export interface PreviewGuardianReceipt {
  receipt_id: string;
  receipt_type: string;
  verdict: string;
  source_system: string;
}

export interface GateResult {
  ok: boolean;
  code: string;
  reason: string;
}

export interface PreviewArtifact {
  task_id: string;
  tenant_id: string;
  build_manifest_digest: string;
  status: "PREPARED_NOT_DEPLOYED" | "PREVIEW_READY";
  preview_url: string | null;
  source_sha: string | null;
  noindex: true;
  rollback_reference: string;
  qa_receipt_id: string;
  guardian_receipt_id: string | null;
  production_touched: false;
}

const SHA_PATTERN = /^[0-9a-f]{40}$/;

function deny(code: string, reason: string): GateResult { return { ok: false, code: code, reason: reason }; }
function permit(code: string, reason: string): GateResult { return { ok: true, code: code, reason: reason }; }

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

export function evaluateIndependentQaGate(work: PreviewWork, qa: PreviewQaReceipt | null, workerIdentity: string): GateResult {
  if (!qa || !qa.receipt_id) return deny(PREVIEW_CODES.QA_MISSING, "an independent QA receipt is required before an artifact is accepted");
  if (qa.verdict !== "PASS") return deny(PREVIEW_CODES.QA_NOT_PASS, "the QA verdict is not PASS");
  if (qa.source_system === workerIdentity || qa.source_system === work.requested_by || DENIED_RECEIPT_ISSUERS.indexOf(qa.source_system) !== -1) {
    return deny(PREVIEW_CODES.QA_NOT_INDEPENDENT, "the QA receipt was issued by the worker or the requester");
  }
  const sha = work.source_sha || "";
  if (!SHA_PATTERN.test(sha) || String(qa.source_sha || "") !== sha) return deny(PREVIEW_CODES.QA_SHA_MISMATCH, "the QA receipt was issued against a different source SHA");
  return permit("PREVIEW_QA_GATE_PASSED", "independent QA receipt names this exact source SHA");
}

export function evaluateGuardianGate(guardian: PreviewGuardianReceipt | null, work: PreviewWork, workerIdentity: string): GateResult {
  if (!guardian) return permit("PREVIEW_GUARDIAN_PENDING", "no Guardian receipt yet: the artifact stays undeployed and cannot be promoted");
  if (guardian.source_system === workerIdentity || guardian.source_system === work.requested_by || DENIED_RECEIPT_ISSUERS.indexOf(guardian.source_system) !== -1) {
    return deny(PREVIEW_CODES.GUARDIAN_NOT_INDEPENDENT, "the Guardian receipt was issued by the worker or the requester");
  }
  if (guardian.verdict !== "PASS") return deny(PREVIEW_CODES.GUARDIAN_NOT_PASS, "the Guardian verdict is not PASS");
  return permit("PREVIEW_GUARDIAN_GATE_PASSED", "independent Guardian receipt present");
}

export function buildPreviewArtifact(work: PreviewWork, qa: PreviewQaReceipt, guardian: PreviewGuardianReceipt | null, buildManifestDigest: string, deployAuthorized: boolean, previewUrl: string | null): PreviewArtifact {
  return {
    task_id: work.task_id,
    tenant_id: work.tenant_id,
    build_manifest_digest: buildManifestDigest,
    status: deployAuthorized && guardian ? "PREVIEW_READY" : "PREPARED_NOT_DEPLOYED",
    preview_url: deployAuthorized && guardian ? previewUrl : null,
    source_sha: work.source_sha,
    noindex: true,
    rollback_reference: "no rollback required: preview build only, no production write. If the preview must be withdrawn, remove the preview deployment; the queue row, its lease and its receipts stay as audit evidence.",
    qa_receipt_id: qa.receipt_id,
    guardian_receipt_id: guardian ? guardian.receipt_id : null,
    production_touched: false
  };
}

export interface PreviewHandlerDeps {
  context: PreviewRuntimeContext;
  workerIdentity: string;
  deployAuthorized: boolean;
  previewUrl?: string | null;
}

export interface PreviewHandlerResult {
  ok: boolean;
  code: string;
  reason: string;
  artifact?: PreviewArtifact;
}

export function createPreviewHandler(deps: PreviewHandlerDeps) {
  return async function handle(work: PreviewWork, qa: PreviewQaReceipt | null, guardian: PreviewGuardianReceipt | null, buildManifestDigest: string | null): Promise<PreviewHandlerResult> {
    const gates = [
      evaluateFeatureGate(deps.context, work),
      evaluateDatabaseFencing(deps.context, work),
      evaluateIndependentQaGate(work, qa, deps.workerIdentity),
      evaluateGuardianGate(guardian, work, deps.workerIdentity)
    ];
    for (const gate of gates) {
      if (!gate.ok) return { ok: false, code: gate.code, reason: gate.reason };
    }
    if (!buildManifestDigest || !SHA_PATTERN.test(String(buildManifestDigest))) {
      return { ok: false, code: PREVIEW_CODES.BUILD_DIGEST_REQUIRED, reason: "a 40-hex build manifest digest is required from the launch engine build" };
    }
    const artifact = buildPreviewArtifact(work, qa as PreviewQaReceipt, guardian, String(buildManifestDigest), deps.deployAuthorized, deps.previewUrl || null);
    if (!deps.deployAuthorized) {
      return { ok: true, code: PREVIEW_CODES.DEPLOY_NOT_AUTHORIZED, reason: "gates passed; the artifact is prepared but not deployed", artifact: artifact };
    }
    if (!guardian) {
      return { ok: true, code: PREVIEW_CODES.DEPLOY_NOT_AUTHORIZED, reason: "gates passed but no Guardian receipt exists, so the preview is not deployed", artifact: artifact };
    }
    return { ok: true, code: "PREVIEW_READY", reason: "gates passed and the staging preview deployment was authorized", artifact: artifact };
  };
}
