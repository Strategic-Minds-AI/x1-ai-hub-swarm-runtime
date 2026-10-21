import test from "node:test";
import assert from "node:assert/strict";

// The module is compiled to dist by npm run build; when it is not built yet this
// falls back to the TypeScript source, which Node strips types from natively.
async function loadModule() {
  try { return await import("../dist/preview-pipeline.js"); } catch (error) { return await import("../src/preview-pipeline.ts"); }
}
const { createPreviewHandler, evaluateFeatureGate, evaluateDatabaseFencing, evaluateIndependentQaGate, evaluateGuardianGate, PREVIEW_CODES } = await loadModule();

const STAGING = "uvdkzsbjackpjvpoxtyk";
const PRODUCTION = "vgsmyhqqtkkluhypxyua";
const TENANT = "666f23bf-61bd-4be0-b5cb-4872e04fad9b";
const SHA = "dd186b7de199f05998e5c69a41d8af1547e28eb2";
const BUILD_DIGEST = "b".repeat(40);

const context = { runtime_env: "preview", system_tenant_id: TENANT, preview_enabled: true, staging_supabase_ref: STAGING, production_supabase_ref: PRODUCTION, source_sha: SHA };
const worker = { work_id: "work-1", task_id: "x1.preview.site.20261021", tenant_id: TENANT, requested_by: "x1-p0-controlled-worker-restoration", action_class: "NON_PRODUCTION_MUTATION", source_sha: SHA, payload: { noindex: true, target_environment: "preview", supabase_ref: STAGING, sitepack_id: "cobalt-hoodworks-tampa-20261021" } };
const qa = { receipt_id: "qa-receipt-1", verdict: "PASS", source_system: "independent-cloud-browser-qa", source_sha: SHA };
const guardian = { receipt_id: "VC-x1.preview.site.20261021-abc123", receipt_type: "independent_validation", verdict: "PASS", source_system: "guardian-vision-cortex" };
function work(over) { return Object.assign({}, worker, over || {}, { payload: Object.assign({}, worker.payload, (over && over.payload) || {}) }); }

test("feature gate refuses a disabled pipeline, a wrong runtime and a non-preview target", () => {
  assert.equal(evaluateFeatureGate(Object.assign({}, context, { preview_enabled: false }), work()).code, PREVIEW_CODES.FEATURE_DISABLED);
  assert.equal(evaluateFeatureGate(Object.assign({}, context, { runtime_env: "production" }), work()).code, PREVIEW_CODES.ENV_NOT_PREVIEW);
  assert.equal(evaluateFeatureGate(context, work({ action_class: "READ_ONLY" })).code, PREVIEW_CODES.ACTION_UNSUPPORTED);
  assert.equal(evaluateFeatureGate(context, work({ tenant_id: "11111111-1111-1111-1111-111111111111" })).code, PREVIEW_CODES.TENANT_MISMATCH);
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

test("independent QA gate refuses missing, self-issued, failing and mismatched receipts", () => {
  assert.equal(evaluateIndependentQaGate(work(), null, "x1-swarm-preview-1").code, PREVIEW_CODES.QA_MISSING);
  assert.equal(evaluateIndependentQaGate(work(), { receipt_id: "q", verdict: "FAIL", source_system: "qa-bot", source_sha: SHA }, "x1-swarm-preview-1").code, PREVIEW_CODES.QA_NOT_PASS);
  assert.equal(evaluateIndependentQaGate(work(), { receipt_id: "q", verdict: "PASS", source_system: "x1-swarm-preview-1", source_sha: SHA }, "x1-swarm-preview-1").code, PREVIEW_CODES.QA_NOT_INDEPENDENT);
  assert.equal(evaluateIndependentQaGate(work(), { receipt_id: "q", verdict: "PASS", source_system: work().requested_by, source_sha: SHA }, "x1-swarm-preview-1").code, PREVIEW_CODES.QA_NOT_INDEPENDENT);
  assert.equal(evaluateIndependentQaGate(work(), { receipt_id: "q", verdict: "PASS", source_system: "base44-builder", source_sha: SHA }, "x1-swarm-preview-1").code, PREVIEW_CODES.QA_NOT_INDEPENDENT);
  assert.equal(evaluateIndependentQaGate(work(), { receipt_id: "q", verdict: "PASS", source_system: "qa-bot", source_sha: "1".repeat(40) }, "x1-swarm-preview-1").code, PREVIEW_CODES.QA_SHA_MISMATCH);
  assert.equal(evaluateIndependentQaGate(work(), qa, "x1-swarm-preview-1").ok, true);
});

test("guardian gate accepts an independent receipt and refuses a self-issued one", () => {
  assert.equal(evaluateGuardianGate(null, work(), "x1-swarm-preview-1").code, "PREVIEW_GUARDIAN_PENDING");
  assert.equal(evaluateGuardianGate({ receipt_id: "g", receipt_type: "independent_validation", verdict: "PASS", source_system: "base44-builder" }, work(), "x1-swarm-preview-1").code, PREVIEW_CODES.GUARDIAN_NOT_INDEPENDENT);
  assert.equal(evaluateGuardianGate({ receipt_id: "g", receipt_type: "independent_validation", verdict: "BLOCKED", source_system: "guardian-vision-cortex" }, work(), "x1-swarm-preview-1").code, PREVIEW_CODES.GUARDIAN_NOT_PASS);
  assert.equal(evaluateGuardianGate(guardian, work(), "x1-swarm-preview-1").ok, true);
});

test("handler prepares an artifact and never deploys without authorization", async () => {
  const handle = createPreviewHandler({ context: context, workerIdentity: "x1-swarm-preview-1", deployAuthorized: false });
  const result = await handle(work(), qa, guardian, BUILD_DIGEST);
  assert.equal(result.ok, true);
  assert.equal(result.code, PREVIEW_CODES.DEPLOY_NOT_AUTHORIZED);
  assert.equal(result.artifact.status, "PREPARED_NOT_DEPLOYED");
  assert.equal(result.artifact.preview_url, null);
  assert.equal(result.artifact.noindex, true);
  assert.equal(result.artifact.production_touched, false);
  assert.equal(result.artifact.guardian_receipt_id, guardian.receipt_id);
  assert.match(result.artifact.rollback_reference, /no production write/);
});

test("handler refuses every failing gate before producing an artifact", async () => {
  const handle = createPreviewHandler({ context: context, workerIdentity: "x1-swarm-preview-1", deployAuthorized: false });
  const cases = [
    [work({ payload: { noindex: false } }), qa, guardian, PREVIEW_CODES.NOINDEX_REQUIRED],
    [work({ payload: { supabase_ref: PRODUCTION } }), qa, guardian, PREVIEW_CODES.PRODUCTION_FENCE],
    [work(), null, guardian, PREVIEW_CODES.QA_MISSING],
    [work(), qa, { receipt_id: "g", receipt_type: "independent_validation", verdict: "BLOCKED", source_system: "guardian-vision-cortex" }, PREVIEW_CODES.GUARDIAN_NOT_PASS]
  ];
  for (const entry of cases) {
    const result = await handle(entry[0], entry[1], entry[2], BUILD_DIGEST);
    assert.equal(result.ok, false);
    assert.equal(result.code, entry[3]);
    assert.equal(result.artifact, undefined);
  }
});

test("handler refuses a missing or malformed build manifest digest", async () => {
  const handle = createPreviewHandler({ context: context, workerIdentity: "x1-swarm-preview-1", deployAuthorized: false });
  assert.equal((await handle(work(), qa, guardian, null)).code, PREVIEW_CODES.BUILD_DIGEST_REQUIRED);
  assert.equal((await handle(work(), qa, guardian, "not-a-digest")).code, PREVIEW_CODES.BUILD_DIGEST_REQUIRED);
});

test("an authorized staging deploy still requires a Guardian receipt", async () => {
  const handle = createPreviewHandler({ context: context, workerIdentity: "x1-swarm-preview-1", deployAuthorized: true, previewUrl: "https://x1-preview-staging.example/sites/cobalt-hoodworks" });
  const withoutGuardian = await handle(work(), qa, null, BUILD_DIGEST);
  assert.equal(withoutGuardian.code, PREVIEW_CODES.DEPLOY_NOT_AUTHORIZED);
  assert.equal(withoutGuardian.artifact.status, "PREPARED_NOT_DEPLOYED");
  assert.equal(withoutGuardian.artifact.preview_url, null);
  const withGuardian = await handle(work(), qa, guardian, BUILD_DIGEST);
  assert.equal(withGuardian.code, "PREVIEW_READY");
  assert.equal(withGuardian.artifact.status, "PREVIEW_READY");
  assert.equal(withGuardian.artifact.preview_url, "https://x1-preview-staging.example/sites/cobalt-hoodworks");
  assert.equal(withGuardian.artifact.production_touched, false);
});
