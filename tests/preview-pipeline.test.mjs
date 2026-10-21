import test from "node:test";
import assert from "node:assert/strict";

// The module is compiled to dist by npm run build; when it is not built yet this
// falls back to the TypeScript source, which Node strips types from natively.
async function loadModule() {
  try { return await import("../dist/preview-pipeline.js"); } catch (error) { return await import("../src/preview-pipeline.ts"); }
}
const { createPreviewHandler, evaluateFeatureGate, evaluateDatabaseFencing, verifyBuildManifest, evaluateIndependentQaGate, evaluateGuardianGate, verifyDeploymentEvidence, PREVIEW_CODES, BUILD_MANIFEST_SCHEMA } = await loadModule();

const STAGING = "uvdkzsbjackpjvpoxtyk";
const PRODUCTION = "vgsmyhqqtkkluhypxyua";
const TENANT = "666f23bf-61bd-4be0-b5cb-4872e04fad9b";
const OTHER_TENANT = "11111111-1111-1111-1111-111111111111";
const SHA = "dd186b7de199f05998e5c69a41d8af1547e28eb2";
const OTHER_SHA = "1".repeat(40);
const ARTIFACT = "7acde72a7c916d0e28f96720cd0c4de24ac89ebb963827fc0594e137e9e461d7";
const TASK = "x1.preview.site.20261021";
const REQUESTER = "x1-p0-controlled-worker-restoration";
const WORKER = "x1-swarm-preview-1";
const HOST = "x1-preview-staging.example";
const PREVIEW_URL = "https://x1-preview-staging.example/sites/cobalt-hoodworks";
const ALLOWLIST = [HOST];

function manifest(over) {
  return Object.assign({
    schema: BUILD_MANIFEST_SCHEMA,
    sitepack_id: "cobalt-hoodworks-tampa-20261021",
    industry_slug: "commercial-kitchen-exhaust-cleaning",
    phase: "preview",
    target_environment: "preview",
    noindex: true,
    sitemap: "OMITTED_WHILE_NOINDEX",
    lead_mode: "DISABLED",
    source_sha: SHA,
    gates: {
      noindex_enforced: true, preview_target_enforced: true, lead_endpoint_staging_fenced: true,
      production_reference_absent: true, structured_data_present: true, source_sha_pinned: true,
      independent_qa_required: true, guardian_receipt_required_before_promotion: true, synthetic_label_required: true
    },
    artifact_digest: ARTIFACT,
    files: [
      { path: "index.html", bytes: 15497, sha256: "a".repeat(64) },
      { path: "robots.txt", bytes: 132, sha256: "b".repeat(64) }
    ]
  }, over || {});
}
const context = { runtime_env: "preview", system_tenant_id: TENANT, preview_enabled: true, staging_supabase_ref: STAGING, production_supabase_ref: PRODUCTION, source_sha: SHA };
function work(over) {
  const base = {
    work_id: "work-1", task_id: TASK, tenant_id: TENANT, requested_by: REQUESTER,
    action_class: "NON_PRODUCTION_MUTATION", source_sha: SHA,
    payload: { noindex: true, target_environment: "preview", supabase_ref: STAGING, sitepack_id: "cobalt-hoodworks-tampa-20261021", build_manifest: manifest() }
  };
  const merged = Object.assign({}, base, over || {});
  merged.payload = Object.assign({}, base.payload, (over && over.payload) || {});
  return merged;
}
function qaRow(over) {
  return Object.assign({
    receipt_id: "qa-receipt-1", receipt_type: "independent_qa", tenant_id: TENANT,
    source_system: "independent-cloud-browser-qa", source_sha: SHA,
    payload: { task_id: TASK, tenant_id: TENANT, decision: "PASS", artifact_digest: ARTIFACT }
  }, over || {});
}
// The exact shape the control plane writes for an independent validation.
function guardianRow(over) {
  return Object.assign({
    receipt_id: "VC-" + TASK + "-abc123", receipt_type: "independent_validation", tenant_id: TENANT,
    source_system: "guardian-vision-cortex", source_sha: SHA,
    payload: {
      task_id: TASK, tenant_id: TENANT, decision: "PASS", artifact_digest: ARTIFACT,
      validation_kind: "website_artifact",
      build_evidence: { artifact_digest: ARTIFACT, source_sha: SHA, file_count: 2 },
      validator_identity: "guardian-vision-cortex", validator_credential_class: "VALIDATOR"
    }
  }, over || {});
}
function reader(rows, failure) {
  const state = { calls: [], returns: rows };
  return {
    state: state,
    readTaskReceipts: async (ref) => { state.calls.push(ref); if (failure) throw new Error(failure); return state.returns; }
  };
}
function handler(over, rows, failure) {
  const readback = reader(rows === undefined ? [qaRow(), guardianRow()] : rows, failure);
  const deps = Object.assign({
    context: context, workerIdentity: WORKER, receipts: readback, deployAuthorized: false, previewHostAllowlist: ALLOWLIST
  }, over || {});
  return { readback: readback, handle: createPreviewHandler(deps) };
}

test("feature gate refuses a disabled pipeline, a wrong runtime and a non-preview target", () => {
  assert.equal(evaluateFeatureGate(Object.assign({}, context, { preview_enabled: false }), work()).code, PREVIEW_CODES.FEATURE_DISABLED);
  assert.equal(evaluateFeatureGate(Object.assign({}, context, { runtime_env: "production" }), work()).code, PREVIEW_CODES.ENV_NOT_PREVIEW);
  assert.equal(evaluateFeatureGate(context, work({ action_class: "READ_ONLY" })).code, PREVIEW_CODES.ACTION_UNSUPPORTED);
  assert.equal(evaluateFeatureGate(context, work({ tenant_id: OTHER_TENANT })).code, PREVIEW_CODES.TENANT_MISMATCH);
  assert.equal(evaluateFeatureGate(context, work({ payload: { noindex: false } })).code, PREVIEW_CODES.NOINDEX_REQUIRED);
  assert.equal(evaluateFeatureGate(context, work({ payload: { target_environment: "production" } })).code, PREVIEW_CODES.TARGET_NOT_PREVIEW);
  assert.equal(evaluateFeatureGate(context, work()).ok, true);
});

test("database fence refuses production refs anywhere in the payload", () => {
  assert.equal(evaluateDatabaseFencing(context, work({ payload: { supabase_ref: "" } })).code, PREVIEW_CODES.DB_REF_REQUIRED);
  assert.equal(evaluateDatabaseFencing(context, work({ payload: { supabase_ref: PRODUCTION } })).code, PREVIEW_CODES.PRODUCTION_FENCE);
  assert.equal(evaluateDatabaseFencing(context, work({ payload: { supabase_ref: "some-other-ref" } })).code, PREVIEW_CODES.DB_REF_NOT_STAGING);
  assert.equal(evaluateDatabaseFencing(context, work({ payload: { nested: { ref: PRODUCTION } } })).code, PREVIEW_CODES.PRODUCTION_FENCE);
  assert.equal(evaluateDatabaseFencing(context, work()).ok, true);
});

test("build manifest contract: the launch engine sha256 shape is accepted", () => {
  assert.equal(verifyBuildManifest(manifest(), work(), context).ok, true);
});

test("build manifest contract: a 40-hex digest, a wrong schema, a missing key or a missing gate is refused", () => {
  assert.equal(verifyBuildManifest(manifest({ artifact_digest: SHA }), work(), context).code, PREVIEW_CODES.BUILD_MANIFEST_INVALID);
  assert.equal(verifyBuildManifest(manifest({ artifact_digest: "not-a-digest" }), work(), context).code, PREVIEW_CODES.BUILD_MANIFEST_INVALID);
  assert.equal(verifyBuildManifest(manifest({ schema: "strategic-minds/sitepack-build-manifest/v0" }), work(), context).code, PREVIEW_CODES.BUILD_MANIFEST_INVALID);
  assert.equal(verifyBuildManifest(manifest({ noindex: false }), work(), context).code, PREVIEW_CODES.BUILD_MANIFEST_INVALID);
  assert.equal(verifyBuildManifest(manifest({ source_sha: "UNPINNED" }), work(), context).code, PREVIEW_CODES.BUILD_MANIFEST_INVALID);
  assert.equal(verifyBuildManifest(manifest({ files: [] }), work(), context).code, PREVIEW_CODES.BUILD_MANIFEST_INVALID);
  assert.equal(verifyBuildManifest(manifest({ files: [{ path: "index.html", bytes: 10, sha256: SHA }] }), work(), context).code, PREVIEW_CODES.BUILD_MANIFEST_INVALID);
  const missingGate = manifest();
  missingGate.gates.synthetic_label_required = false;
  assert.equal(verifyBuildManifest(missingGate, work(), context).code, PREVIEW_CODES.BUILD_MANIFEST_INVALID);
  const missingKey = manifest();
  delete missingKey.sitepack_id;
  assert.equal(verifyBuildManifest(missingKey, work(), context).code, PREVIEW_CODES.BUILD_MANIFEST_INVALID);
  assert.equal(verifyBuildManifest(undefined, work(), context).code, PREVIEW_CODES.BUILD_MANIFEST_INVALID);
});

test("build manifest contract: a manifest built from another SHA is refused", () => {
  assert.equal(verifyBuildManifest(manifest({ source_sha: OTHER_SHA }), work(), context).code, PREVIEW_CODES.BUILD_SHA_MISMATCH);
  assert.equal(verifyBuildManifest(manifest({ source_sha: OTHER_SHA }), work({ source_sha: OTHER_SHA }), context).code, PREVIEW_CODES.BUILD_SHA_MISMATCH);
  assert.equal(verifyBuildManifest(manifest({ source_sha: OTHER_SHA }), work({ source_sha: OTHER_SHA }), Object.assign({}, context, { source_sha: null })).ok, true);
});

test("QA gate: a readback row is required and every mismatched field is refused", () => {
  const rows = [guardianRow()];
  assert.equal(evaluateIndependentQaGate([], work(), ARTIFACT, WORKER).code, PREVIEW_CODES.QA_MISSING);
  assert.equal(evaluateIndependentQaGate(rows, work(), ARTIFACT, WORKER).code, PREVIEW_CODES.QA_MISSING);
  assert.equal(evaluateIndependentQaGate([qaRow({ payload: Object.assign(qaRow().payload, { decision: "FAIL" }) })], work(), ARTIFACT, WORKER).code, PREVIEW_CODES.QA_INVALID);
  assert.equal(evaluateIndependentQaGate([qaRow({ payload: Object.assign(qaRow().payload, { task_id: "other" }) })], work(), ARTIFACT, WORKER).code, PREVIEW_CODES.RECEIPT_TASK_MISMATCH);
  assert.equal(evaluateIndependentQaGate([qaRow({ tenant_id: OTHER_TENANT, payload: Object.assign(qaRow().payload, { tenant_id: OTHER_TENANT }) })], work(), ARTIFACT, WORKER).code, PREVIEW_CODES.RECEIPT_TENANT_MISMATCH);
  assert.equal(evaluateIndependentQaGate([qaRow({ payload: Object.assign(qaRow().payload, { artifact_digest: "b".repeat(64) }) })], work(), ARTIFACT, WORKER).code, PREVIEW_CODES.RECEIPT_ARTIFACT_MISMATCH);
  assert.equal(evaluateIndependentQaGate([qaRow({ source_sha: OTHER_SHA })], work(), ARTIFACT, WORKER).code, PREVIEW_CODES.RECEIPT_ARTIFACT_MISMATCH);
  for (const issuers of [[WORKER], [REQUESTER], ["base44-builder"], ["base44-superagent"]]) {
    assert.equal(evaluateIndependentQaGate([qaRow({ source_system: issuers[0] })], work(), ARTIFACT, WORKER).code, PREVIEW_CODES.QA_INVALID);
  }
  assert.equal(evaluateIndependentQaGate([qaRow()], work(), ARTIFACT, WORKER).ok, true);
});

test("guardian gate: an independent VALIDATOR receipt is required, and a forgery is refused", () => {
  assert.equal(evaluateGuardianGate([qaRow()], work(), ARTIFACT, WORKER).code, PREVIEW_CODES.GUARDIAN_MISSING);
  assert.equal(evaluateGuardianGate([guardianRow({ source_system: "qa-bot", payload: Object.assign(guardianRow().payload, { validator_identity: "qa-bot" }) })], work(), ARTIFACT, WORKER).code, PREVIEW_CODES.GUARDIAN_INVALID);
  assert.equal(evaluateGuardianGate([guardianRow({ payload: Object.assign(guardianRow().payload, { validator_identity: "guardian-other" }) })], work(), ARTIFACT, WORKER).code, PREVIEW_CODES.GUARDIAN_INVALID);
  assert.equal(evaluateGuardianGate([guardianRow({ payload: Object.assign(guardianRow().payload, { validator_credential_class: "WORKER" }) })], work(), ARTIFACT, WORKER).code, PREVIEW_CODES.GUARDIAN_INVALID);
  assert.equal(evaluateGuardianGate([guardianRow({ payload: Object.assign(guardianRow().payload, { validator_credential_class: "" }) })], work(), ARTIFACT, WORKER).code, PREVIEW_CODES.GUARDIAN_INVALID);
  assert.equal(evaluateGuardianGate([guardianRow({ payload: Object.assign(guardianRow().payload, { decision: "BLOCKED" }) })], work(), ARTIFACT, WORKER).code, PREVIEW_CODES.GUARDIAN_INVALID);
  assert.equal(evaluateGuardianGate([guardianRow({ source_system: WORKER, payload: Object.assign(guardianRow().payload, { validator_identity: WORKER }) })], work(), ARTIFACT, WORKER).code, PREVIEW_CODES.GUARDIAN_INVALID);
  assert.equal(evaluateGuardianGate([guardianRow({ payload: Object.assign(guardianRow().payload, { artifact_digest: "c".repeat(64) }) })], work(), ARTIFACT, WORKER).code, PREVIEW_CODES.RECEIPT_ARTIFACT_MISMATCH);
  assert.equal(evaluateGuardianGate([guardianRow(), qaRow()], work(), ARTIFACT, WORKER).ok, true);
});

test("guardian gate: only an explicit website_artifact validation can certify a preview build", () => {
  const row = (payload) => { const built = guardianRow(); built.payload = Object.assign({}, guardianRow().payload, payload); return [built]; };
  assert.equal(evaluateGuardianGate(row({ validation_kind: "execution_evidence" }), work(), ARTIFACT, WORKER).code, PREVIEW_CODES.GUARDIAN_KIND_INVALID);
  assert.equal(evaluateGuardianGate(row({ validation_kind: undefined }), work(), ARTIFACT, WORKER).code, PREVIEW_CODES.GUARDIAN_KIND_INVALID);
  assert.equal(evaluateGuardianGate(row({ build_evidence: undefined }), work(), ARTIFACT, WORKER).code, PREVIEW_CODES.GUARDIAN_KIND_INVALID);
  assert.equal(evaluateGuardianGate(row({ build_evidence: { artifact_digest: "c".repeat(64), source_sha: SHA, file_count: 2 } }), work(), ARTIFACT, WORKER).code, PREVIEW_CODES.GUARDIAN_KIND_INVALID);
  assert.equal(evaluateGuardianGate(row({ build_evidence: { artifact_digest: ARTIFACT, source_sha: OTHER_SHA, file_count: 2 } }), work(), ARTIFACT, WORKER).code, PREVIEW_CODES.GUARDIAN_KIND_INVALID);
  assert.equal(evaluateGuardianGate(row({ build_evidence: { artifact_digest: ARTIFACT, source_sha: SHA, file_count: 0 } }), work(), ARTIFACT, WORKER).code, PREVIEW_CODES.GUARDIAN_KIND_INVALID);
  // an execution-evidence receipt carries no artifact digest at all, so it fails even earlier
  assert.equal(evaluateGuardianGate(row({ validation_kind: "execution_evidence", artifact_digest: undefined }), work(), ARTIFACT, WORKER).code, PREVIEW_CODES.RECEIPT_ARTIFACT_MISMATCH);
  assert.equal(evaluateGuardianGate([guardianRow()], work(), ARTIFACT, WORKER).ok, true);
});

test("READ_ONLY work is never a preview mutation, so no artifact or manifest is required of it", () => {
  const readOnly = {
    work_id: "work-readonly-1", task_id: TASK, tenant_id: TENANT, requested_by: REQUESTER,
    action_class: "READ_ONLY", source_sha: SHA,
    payload: { noindex: true, target_environment: "preview", supabase_ref: STAGING }
  };
  const gate = evaluateFeatureGate(context, readOnly);
  assert.equal(gate.code, PREVIEW_CODES.ACTION_UNSUPPORTED);
  assert.equal(gate.ok, false);
  assert.equal(readOnly.payload.build_manifest, undefined, "a READ_ONLY run carries no build manifest and no artifact digest");
});


test("handler reads the receipts itself and prepares an artifact without deploying", async () => {
  const run = handler();
  assert.equal(run.handle.length, 1, "the handler takes the work item only: it must accept no caller-supplied receipt");
  const result = await run.handle(work());
  assert.equal(result.ok, true);
  assert.equal(result.code, PREVIEW_CODES.DEPLOY_NOT_AUTHORIZED);
  assert.equal(result.artifact.status, "PREPARED_NOT_DEPLOYED");
  assert.equal(result.artifact.preview_url, null);
  assert.equal(result.artifact.noindex, true);
  assert.equal(result.artifact.production_touched, false);
  assert.equal(result.artifact.build_manifest_digest, ARTIFACT);
  assert.equal(result.artifact.guardian_receipt_id, guardianRow().receipt_id);
  assert.match(result.artifact.rollback_reference, /no production write/);
  assert.deepEqual(run.readback.state.calls, [{ tenant_id: TENANT, task_id: TASK }]);
});

test("handler refuses every failing gate before producing an artifact", async () => {
  const cases = [
    [work({ payload: { noindex: false } }), undefined, undefined, PREVIEW_CODES.NOINDEX_REQUIRED],
    [work({ payload: { supabase_ref: PRODUCTION } }), undefined, undefined, PREVIEW_CODES.PRODUCTION_FENCE],
    [work({ payload: { build_manifest: undefined } }), undefined, undefined, PREVIEW_CODES.BUILD_MANIFEST_INVALID],
    [work(), [], undefined, PREVIEW_CODES.QA_MISSING],
    [work(), [qaRow()], undefined, PREVIEW_CODES.GUARDIAN_MISSING],
    [work(), [qaRow(), guardianRow({ payload: Object.assign(guardianRow().payload, { decision: "BLOCKED" }) })], undefined, PREVIEW_CODES.GUARDIAN_INVALID],
    [work(), [qaRow(), guardianRow({ source_system: "base44-builder", payload: Object.assign(guardianRow().payload, { validator_identity: "base44-builder" }) })], undefined, PREVIEW_CODES.GUARDIAN_INVALID]
  ];
  for (const entry of cases) {
    const run = handler({}, entry[1]);
    const result = await run.handle(entry[0]);
    assert.equal(result.ok, false, entry[3] + " was accepted");
    assert.equal(result.code, entry[3]);
    assert.equal(result.artifact, undefined);
  }
});

test("handler fails closed when the authenticated readback cannot be proven", async () => {
  const failure = handler({}, [qaRow(), guardianRow()], "PREVIEW_READBACK_FAILED:500:GATEWAY_REFUSED_500");
  const result = await failure.handle(work());
  assert.equal(result.ok, false);
  assert.equal(result.code, PREVIEW_CODES.READBACK_FAILED);
  assert.equal(result.artifact, undefined);
  const noList = handler({}, null);
  assert.equal((await noList.handle(work())).code, PREVIEW_CODES.READBACK_FAILED);
});

test("deployment evidence: no verified reachable URL means no PREVIEW_READY", async () => {
  const unauthorized = handler({ deployAuthorized: true });
  assert.equal((await unauthorized.handle(work())).code, PREVIEW_CODES.DEPLOY_UNVERIFIED);

  const wrongDigest = handler({ deployAuthorized: true, deployPreview: async () => ({ url: PREVIEW_URL, artifact_digest: "d".repeat(64) }) });
  assert.equal((await wrongDigest.handle(work())).code, PREVIEW_CODES.DEPLOY_UNVERIFIED);

  const unreachable = handler({ deployAuthorized: true, deployPreview: async () => ({ url: PREVIEW_URL, artifact_digest: ARTIFACT }), probePreviewUrl: async () => ({ reachable: false, http_status: 0, checked_at: "2026-10-21T04:00:00.000Z" }) });
  assert.equal((await unreachable.handle(work())).code, PREVIEW_CODES.DEPLOY_UNVERIFIED);

  const notOk = handler({ deployAuthorized: true, deployPreview: async () => ({ url: PREVIEW_URL, artifact_digest: ARTIFACT }), probePreviewUrl: async () => ({ reachable: true, http_status: 503, checked_at: "2026-10-21T04:00:00.000Z" }) });
  assert.equal((await notOk.handle(work())).code, PREVIEW_CODES.DEPLOY_UNVERIFIED);

  const offAllowlist = handler({ deployAuthorized: true, deployPreview: async () => ({ url: "https://evil.example/site", artifact_digest: ARTIFACT }), probePreviewUrl: async () => ({ reachable: true, http_status: 200, checked_at: "2026-10-21T04:00:00.000Z" }) });
  const offResult = await offAllowlist.handle(work());
  assert.equal(offResult.code, PREVIEW_CODES.DEPLOY_UNVERIFIED);
  assert.equal(offResult.artifact.preview_url, null);

  const noAllowlist = handler({ deployAuthorized: true, previewHostAllowlist: [], deployPreview: async () => ({ url: PREVIEW_URL, artifact_digest: ARTIFACT }), probePreviewUrl: async () => ({ reachable: true, http_status: 200, checked_at: "2026-10-21T04:00:00.000Z" }) });
  assert.equal((await noAllowlist.handle(work())).code, PREVIEW_CODES.DEPLOY_UNVERIFIED);
});

test("a fully proven preview reports PREVIEW_READY with the evidence attached", async () => {
  const run = handler({
    deployAuthorized: true,
    deployPreview: async () => ({ url: PREVIEW_URL, artifact_digest: ARTIFACT, deployed_at: "2026-10-21T04:00:00.000Z" }),
    probePreviewUrl: async () => ({ reachable: true, http_status: 200, checked_at: "2026-10-21T04:00:01.000Z" })
  });
  const result = await run.handle(work());
  assert.equal(result.code, "PREVIEW_READY");
  assert.equal(result.artifact.status, "PREVIEW_READY");
  assert.equal(result.artifact.preview_url, PREVIEW_URL);
  assert.equal(result.artifact.deployment_evidence.verified, true);
  assert.equal(result.artifact.deployment_evidence.http_status, 200);
  assert.equal(result.artifact.deployment_evidence.artifact_digest, ARTIFACT);
  assert.equal(result.artifact.production_touched, false);
  assert.equal(result.artifact.noindex, true);
});

test("verifyDeploymentEvidence refuses a non-https, non-allowlisted or unreachable URL", () => {
  const probe = { reachable: true, http_status: 200, checked_at: "2026-10-21T04:00:00.000Z" };
  assert.equal(verifyDeploymentEvidence(null, probe, ALLOWLIST).code, PREVIEW_CODES.DEPLOY_UNVERIFIED);
  assert.equal(verifyDeploymentEvidence({ url: "http://x1-preview-staging.example/x", artifact_digest: ARTIFACT }, probe, ALLOWLIST).code, PREVIEW_CODES.DEPLOY_UNVERIFIED);
  assert.equal(verifyDeploymentEvidence({ url: PREVIEW_URL, artifact_digest: "" }, probe, ALLOWLIST).code, PREVIEW_CODES.DEPLOY_UNVERIFIED);
  assert.equal(verifyDeploymentEvidence({ url: PREVIEW_URL, artifact_digest: ARTIFACT }, null, ALLOWLIST).code, PREVIEW_CODES.DEPLOY_UNVERIFIED);
  assert.equal(verifyDeploymentEvidence({ url: PREVIEW_URL, artifact_digest: ARTIFACT }, probe, []).code, PREVIEW_CODES.DEPLOY_UNVERIFIED);
  assert.equal(verifyDeploymentEvidence({ url: PREVIEW_URL, artifact_digest: ARTIFACT }, probe, ALLOWLIST).ok, true);
});
