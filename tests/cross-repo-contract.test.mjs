import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Cross-repository contract conformance. The contract file is byte-identical in the
// launch engine, the runtime and the control plane, and its digest is recorded beside
// it, so a divergence in any repository fails here rather than in production.
async function loadModule() {
  try { return await import("../dist/preview-pipeline.js"); } catch (error) { return await import("../src/preview-pipeline.ts"); }
}
const { verifyBuildManifest, evaluateGuardianGate, evaluateIndependentQaGate, BUILD_MANIFEST_SCHEMA, REQUIRED_MANIFEST_KEYS, REQUIRED_MANIFEST_GATES, PREVIEW_CODES } = await loadModule();

const CONTRACT_PATH = "contracts/PREVIEW_PIPELINE_CONTRACT.json";
const DIGEST_PATH = "contracts/PREVIEW_PIPELINE_CONTRACT.sha256";
const contractBytes = readFileSync(CONTRACT_PATH, "utf8");
const contract = JSON.parse(contractBytes);
const recordedDigest = readFileSync(DIGEST_PATH, "utf8").trim();

test("the shared contract file is the exact bytes its recorded digest describes", () => {
  assert.equal(createHash("sha256").update(contractBytes, "utf8").digest("hex"), recordedDigest);
  assert.equal(contract.contract, "strategic-minds.x1.preview-pipeline");
});

test("the runtime implements the manifest contract the launch engine emits", () => {
  assert.equal(BUILD_MANIFEST_SCHEMA, contract.build_manifest.schema);
  assert.deepEqual(REQUIRED_MANIFEST_KEYS.slice().sort(), contract.build_manifest.required_keys.slice().sort());
  assert.deepEqual(REQUIRED_MANIFEST_GATES.slice().sort(), contract.build_manifest.required_gates.slice().sort());
  assert.equal(contract.build_manifest.artifact_digest.pattern, "^[0-9a-f]{64}$");
  assert.equal(contract.build_manifest.source_sha.pattern, "^[0-9a-f]{40}$");
});

test("every refusal in the contract is a code the runtime can emit", () => {
  const emitted = Object.keys(PREVIEW_CODES).map(function (key) { return PREVIEW_CODES[key]; });
  for (const entry of contract.runtime_refusals) {
    assert.ok(emitted.indexOf(entry) !== -1, "the runtime has no code for " + entry);
  }
});

test("a manifest carrying exactly the contract key set is accepted by the runtime", () => {
  const SHA = "dd186b7de199f05998e5c69a41d8af1547e28eb2";
  const manifest = { source_sha: SHA, artifact_digest: "7".repeat(64) };
  manifest.schema = BUILD_MANIFEST_SCHEMA;
  for (const key of REQUIRED_MANIFEST_KEYS) if (!(key in manifest)) manifest[key] = key === "files" ? [] : "placeholder";
  manifest.noindex = true;
  manifest.files = [{ path: "index.html", bytes: 10, sha256: "a".repeat(64) }];
  manifest.gates = {};
  for (const gate of REQUIRED_MANIFEST_GATES) manifest.gates[gate] = true;
  const work = { work_id: "w", task_id: "t", tenant_id: "ten", requested_by: "requester", action_class: "NON_PRODUCTION_MUTATION", source_sha: SHA, payload: {} };
  const context = { runtime_env: "preview", system_tenant_id: "ten", preview_enabled: true, staging_supabase_ref: "s", production_supabase_ref: "p", source_sha: SHA };
  assert.equal(verifyBuildManifest(manifest, work, context).ok, true);
});

test("a control plane receipt carrying exactly the contract payload keys is accepted", () => {
  const SHA = "dd186b7de199f05998e5c69a41d8af1547e28eb2";
  const DIGEST = "7".repeat(64);
  const work = { work_id: "w", task_id: "t", tenant_id: "ten", requested_by: "requester", action_class: "NON_PRODUCTION_MUTATION", source_sha: SHA, payload: {} };
  const payload = {};
  for (const key of contract.validation_receipt.required_payload_keys) payload[key] = key === "decision" ? "PASS" : "placeholder";
  payload.task_id = work.task_id;
  payload.tenant_id = work.tenant_id;
  payload.artifact_digest = DIGEST;
  payload.validator_identity = "guardian-vision-cortex";
  payload.validator_credential_class = contract.validation_receipt.validator_credential_class;
  const row = { receipt_id: "VC-1", receipt_type: contract.validation_receipt.receipt_type, tenant_id: work.tenant_id, source_system: "guardian-vision-cortex", source_sha: SHA, payload: payload };
  assert.equal(evaluateGuardianGate([row], work, DIGEST, "x1-swarm-preview-1").ok, true);
  const qaPayload = Object.assign({}, payload, { validator_identity: undefined });
  const qaRow = { receipt_id: "QA-1", receipt_type: "independent_qa", tenant_id: work.tenant_id, source_system: "independent-cloud-browser-qa", source_sha: SHA, payload: qaPayload };
  assert.equal(evaluateIndependentQaGate([qaRow], work, DIGEST, "x1-swarm-preview-1").ok, true);
  for (const forbidden of contract.validation_receipt.forbidden_issuers) {
    const forged = Object.assign({}, row, { source_system: forbidden, payload: Object.assign({}, payload, { validator_identity: forbidden }) });
    assert.equal(evaluateGuardianGate([forged], work, DIGEST, "x1-swarm-preview-1").ok, false, forbidden + " was accepted as a validator");
  }
});
