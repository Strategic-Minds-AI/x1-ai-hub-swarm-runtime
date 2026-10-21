import type { HttpFetchLike } from "./supabase-execution-ledger.js";
import type { ReceiptRow } from "./preview-pipeline.js";

// Authenticated server-side receipt readback.
// The preview runtime never accepts a receipt object from its caller: it reads the
// ledger rows through the existing authorized database gateway and refuses to proceed
// when the readback cannot be proven. Fail-closed: any transport fault, any ok:false
// answer and any unreadable row raises, so a caller cannot substitute a forgery.

export const RECEIPTS_RPC = "x1_read_task_receipts";

export interface ReceiptReaderConfig {
  gatewayUrl?: string;
  internalServiceToken?: string;
  fetchImpl?: HttpFetchLike;
}

function resolveFetch(config: ReceiptReaderConfig): HttpFetchLike {
  const runtimeFetch = (globalThis as unknown as { fetch?: HttpFetchLike }).fetch;
  const fetchImpl = config.fetchImpl ?? runtimeFetch;
  if (!fetchImpl) throw new Error("PREVIEW_READBACK_FAILED:FETCH_UNAVAILABLE");
  return fetchImpl;
}

export function normalizeReceiptRow(raw: unknown): ReceiptRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const receiptId = typeof row.receipt_id === "string" ? row.receipt_id : "";
  const receiptType = typeof row.receipt_type === "string" ? row.receipt_type : "";
  if (!receiptId || !receiptType) return null;
  const payload = row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {};
  const normalized: ReceiptRow = {
    receipt_id: receiptId,
    receipt_type: receiptType,
    tenant_id: typeof row.tenant_id === "string" ? row.tenant_id : "",
    source_system: typeof row.source_system === "string" ? row.source_system : "",
    source_sha: typeof row.source_sha === "string" ? row.source_sha : "",
    payload: payload
  };
  if (typeof row.created_at === "string") normalized.created_at = row.created_at;
  return normalized;
}

export interface ReceiptReadback {
  readTaskReceipts(ref: { tenant_id: string; task_id: string }): Promise<ReceiptRow[]>;
}

export function createGatewayReceiptReader(config: ReceiptReaderConfig): ReceiptReadback {
  const gatewayUrl = String(config.gatewayUrl ?? "");
  const internalServiceToken = String(config.internalServiceToken ?? "");
  return {
    async readTaskReceipts(ref: { tenant_id: string; task_id: string }): Promise<ReceiptRow[]> {
      if (!gatewayUrl || !internalServiceToken) throw new Error("PREVIEW_READBACK_FAILED:RECEIPT_TRANSPORT_NOT_CONFIGURED");
      if (!ref || !ref.tenant_id || !ref.task_id) throw new Error("PREVIEW_READBACK_FAILED:READBACK_REF_INCOMPLETE");
      const fetchImpl = resolveFetch(config);
      const response = await fetchImpl(gatewayUrl, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + internalServiceToken,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ op: "rpc", name: RECEIPTS_RPC, body: { p_tenant_id: ref.tenant_id, p_task_id: ref.task_id } })
      });
      const text = await response.text();
      let parsed: any = {};
      try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = {}; }
      if (!response.ok || parsed.ok !== true) {
        throw new Error("PREVIEW_READBACK_FAILED:" + String(response.status) + ":" + String(parsed && parsed.code ? parsed.code : "UNKNOWN"));
      }
      const data = parsed.data && typeof parsed.data === "object" ? parsed.data : {};
      const rows = Array.isArray(data.receipts) ? data.receipts : [];
      const normalized: ReceiptRow[] = [];
      for (const row of rows) {
        const shaped = normalizeReceiptRow(row);
        if (!shaped) throw new Error("PREVIEW_READBACK_FAILED:UNREADABLE_RECEIPT_ROW");
        normalized.push(shaped);
      }
      return normalized;
    }
  };
}
