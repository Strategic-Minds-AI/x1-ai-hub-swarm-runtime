/// <reference lib="dom" />
import { createHash } from "node:crypto";
import { APPROVED_ROOFING_TEMPLATE_HTML, APPROVED_ROOFING_TEMPLATE_SHA256 } from "./wle-approved-roofing-template.js";
import type { LeasedWork } from "./types.js";

/**
 * WLE staging-only preview adapter. It reuses X1's signed authorization,
 * singleton worker, durable lease, and execution ledger. No live web publishing.
 */
export const WLE_PREVIEW_KIND = "WLE_SYNTHETIC_PREVIEW_BUILD_V1";
export const WLE_APPROVED_SOURCE_SHA = "aed388468f17916f43a2ccc593981e4fbf1e8603";
export const WLE_CANONICAL_VERCEL_PROJECT = "prj_JbkX4yKWygqBFRhkHL6nbeQXM46f";
export const WLE_STAGING_SUPABASE_URL = "https://uvdkzsbjackpjvpoxtyk.supabase.co";
export const WLE_PRIVATE_BUCKET = "artifact-staging";
const MAX_PREVIEW_BYTES = 128 * 1024;
const DEFAULT_TIMEOUT_MS = 12_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_PAYLOAD_FIELDS = new Set([
  "kind", "template_id", "market", "release_mode", "site_quantity",
  "synthetic", "no_customer_data", "no_spend", "customer_outbound",
  "requires_domain_purchase", "external_mutation",
  "expected_vercel_project_id", "delivery_mode",
]);

export interface WlePreviewAdapterConfig {
  environment: "development" | "preview" | "production";
  systemTenantId: string;
  workerId: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface WlePrivatePreviewReceipt {
  kind: "WLE_STAGING_PRIVATE_PREVIEW_V1";
  work_id: string;
  tenant_id: string;
  source_sha: string;
  approved_template_sha256: string;
  sha256: string;
  byte_size: number;
  storage_bucket: "artifact-staging";
  storage_path: string;
  storage_verified: true;
  private: true;
  noindex: true;
  released: false;
  public_url: null;
  worker_id: string;
}

function failUnless(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
function payloadValid(work: LeasedWork): void {
  failUnless(work.action_class === "NON_PRODUCTION_MUTATION", "WLE_ACTION_CLASS_DENIED");
  failUnless(UUID.test(work.tenant_id) && UUID.test(work.work_id), "WLE_IDENTITY_INVALID");
  failUnless(/^wle\.preview\.synthetic\.[a-z0-9-]{1,60}$/.test(work.task_id), "WLE_TASK_NOT_ALLOWLISTED");
  failUnless(/^WLE-PREVIEW-STAGING-[A-Z0-9-]{1,100}$/.test(work.work_packet_id), "WLE_PACKET_NOT_ALLOWLISTED");
  failUnless(work.source_sha === WLE_APPROVED_SOURCE_SHA, "WLE_SOURCE_NOT_APPROVED");
  failUnless(
    work.required_capabilities.some((v) => v.id === "wle-synthetic-preview-only" && v.mechanism === "policy"),
    "WLE_CAPABILITY_MISSING",
  );
  // A reference is not authorization: X1's separate signed bootstrap receipt
  // and the original lease must still validate before this handler is called.
  failUnless(
    typeof work.approval_reference === "string" &&
    /^WLE-STAGING-SYNTHETIC-[A-Z0-9-]{1,70}$/.test(work.approval_reference),
    "WLE_SCOPED_APPROVAL_REFERENCE_REQUIRED",
  );
  const input = work.payload;
  failUnless(input !== null && typeof input === "object" && !Array.isArray(input), "WLE_PAYLOAD_INVALID");
  failUnless(Object.keys(input).every((key) => ALLOWED_PAYLOAD_FIELDS.has(key)), "WLE_UNEXPECTED_PAYLOAD_FIELD");
  failUnless(input.kind === WLE_PREVIEW_KIND, "WLE_KIND_NOT_ALLOWLISTED");
  failUnless(input.template_id === "roofing", "WLE_TEMPLATE_NOT_APPROVED");
  failUnless(input.market === "Pompano Beach, FL", "WLE_MARKET_NOT_APPROVED");
  failUnless(input.release_mode === "preview" && input.delivery_mode === "private_storage", "WLE_RELEASE_MODE_DENIED");
  failUnless(input.site_quantity === 1, "WLE_SITE_QUANTITY_DENIED");
  failUnless(input.synthetic === true && input.no_customer_data === true && input.no_spend === true, "WLE_SYNTHETIC_GUARD_REQUIRED");
  failUnless(input.customer_outbound === false && input.requires_domain_purchase === false, "WLE_PROTECTED_ACTION_DENIED");
  failUnless(input.external_mutation === true, "WLE_MUTATION_MISCLASSIFIED");
  failUnless(input.expected_vercel_project_id === WLE_CANONICAL_VERCEL_PROJECT, "WLE_VERCEL_PROJECT_MISMATCH");
}

export function renderWleSyntheticPreview(work: LeasedWork): { html: string; sha256: string; byteSize: number } {
  payloadValid(work);
  failUnless(sha256(APPROVED_ROOFING_TEMPLATE_HTML) === APPROVED_ROOFING_TEMPLATE_SHA256, "WLE_TEMPLATE_INTEGRITY_FAILURE");
  failUnless(
    APPROVED_ROOFING_TEMPLATE_HTML.includes('name="robots" content="noindex,nofollow"') &&
    APPROVED_ROOFING_TEMPLATE_HTML.includes("NOT A REAL CONTRACTOR"),
    "WLE_PREVIEW_DISCLAIMER_MISSING",
  );
  const marker = "<!-- WLE_PRIVATE_STAGING_PREVIEW_V1 work=" + work.work_id +
    " tenant=" + work.tenant_id + " market=Pompano_Beach_FL source=" + WLE_APPROVED_SOURCE_SHA +
    " noindex=true no_customer_data=true -->";
  const html = APPROVED_ROOFING_TEMPLATE_HTML.replace("</body></html>", marker + "</body></html>");
  failUnless(html !== APPROVED_ROOFING_TEMPLATE_HTML && html.endsWith("</html>"), "WLE_TEMPLATE_RENDER_FAILED");
  const byteSize = new TextEncoder().encode(html).byteLength;
  failUnless(byteSize > 1000 && byteSize <= MAX_PREVIEW_BYTES, "WLE_PREVIEW_SIZE_DENIED");
  return { html, sha256: sha256(html), byteSize };
}

export async function handleWleSyntheticPreview(
  work: LeasedWork, config: WlePreviewAdapterConfig,
): Promise<WlePrivatePreviewReceipt> {
  // Before any network call, enforce fixed environment, identity and policy.
  failUnless(config.environment === "preview", "WLE_PREVIEW_ENVIRONMENT_REQUIRED");
  failUnless(config.systemTenantId === work.tenant_id, "WLE_CROSS_TENANT_DENIED");
  failUnless(config.workerId === work.lease.holderAgentId && work.lease.taskId === work.task_id, "WLE_LEASE_MISMATCH");
  failUnless(config.supabaseUrl === WLE_STAGING_SUPABASE_URL, "WLE_STAGING_SUPABASE_ONLY");
  failUnless(typeof config.serviceRoleKey === "string" && config.serviceRoleKey.length > 20, "WLE_SERVER_CREDENTIAL_REQUIRED");
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  failUnless(Number.isInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 15000, "WLE_TIMEOUT_BOUNDS_INVALID");
  const rendered = renderWleSyntheticPreview(work);
  // Private bucket only. Work ID + tenant ID uniquely scope the object. Never upsert.
  const storagePath = "wle-preview/" + work.tenant_id + "/" + work.work_id + "/index.html";
  const url = WLE_STAGING_SUPABASE_URL + "/storage/v1/object/" + WLE_PRIVATE_BUCKET + "/" + storagePath;
  const fetchImpl = config.fetchImpl ?? fetch;
  const headers = {
    "Authorization": "Bearer " + config.serviceRoleKey,
    "apikey": config.serviceRoleKey,
    "Content-Type": "text/html; charset=utf-8",
    "x-upsert": "false",
    "Cache-Control": "private, no-store",
  };
  // POST can time out after storage accepted bytes. Always perform independent
  // authenticated GET and verify the full hash before acknowledging success.
  let uploadStatus = 0;
  try {
    const response = await fetchImpl(url, {
      method: "POST", headers, body: rendered.html,
      signal: AbortSignal.timeout(timeoutMs),
    });
    uploadStatus = response.status;
  } catch {
    uploadStatus = 0;
  }
  const verifyResponse = await fetchImpl(url, {
    method: "GET", headers: {
      "Authorization": headers.Authorization, "apikey": headers.apikey,
      "Cache-Control": "no-store",
    }, signal: AbortSignal.timeout(timeoutMs),
  });
  failUnless(verifyResponse.ok, "WLE_ARTIFACT_NOT_PERSISTENCE_VERIFIED_" + uploadStatus);
  const verifiedBody = await verifyResponse.text();
  const verifiedBytes = new TextEncoder().encode(verifiedBody).byteLength;
  failUnless(
    verifiedBytes === rendered.byteSize && sha256(verifiedBody) === rendered.sha256,
    "WLE_STORAGE_OBJECT_HASH_MISMATCH",
  );
  return {
    kind: "WLE_STAGING_PRIVATE_PREVIEW_V1",
    work_id: work.work_id, tenant_id: work.tenant_id,
    source_sha: WLE_APPROVED_SOURCE_SHA,
    approved_template_sha256: APPROVED_ROOFING_TEMPLATE_SHA256,
    sha256: rendered.sha256, byte_size: rendered.byteSize,
    storage_bucket: WLE_PRIVATE_BUCKET, storage_path: storagePath,
    storage_verified: true, private: true, noindex: true,
    released: false, public_url: null, worker_id: config.workerId,
  };
}
