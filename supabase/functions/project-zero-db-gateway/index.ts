import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const serviceName = "project-zero-preview";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function secretKey(): string {
  const map = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (map) {
    const parsed = JSON.parse(map) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("SUPABASE_SECRET_KEY_UNAVAILABLE");
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

async function admin(path: string, init: RequestInit = {}) {
  const key = secretKey();
  const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) return { ok:false, status:res.status, body };
  return { ok:true, status:res.status, body };
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,"0")).join("");
}

async function workerCredentialAuthorized(digest: string) {
  const result = await admin("rpc/x1_match_worker_auth", {
    method:"POST",
    body:JSON.stringify({
      p_service_name:serviceName,
      p_token_sha256:digest,
    }),
  });
  return result.ok && typeof result.body === "string" && result.body.length > 0;
}

async function authorized(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\\s+/i, "");
  if (!token) return false;
  const digest = await sha256Hex(token);

  const q = `x1_service_auth_hashes?select=token_sha256&service_name=eq.${encodeURIComponent(serviceName)}&active=eq.true&limit=1`;
  const legacy = await admin(q, { method:"GET" });
  if (
    legacy.ok &&
    Array.isArray(legacy.body) &&
    legacy.body.length === 1 &&
    String((legacy.body[0] as Record<string, unknown>).token_sha256 || "") === digest
  ) {
    return true;
  }

  return workerCredentialAuthorized(digest);
}

async function rpc(name: string, body: unknown) {
  return admin(`rpc/${name}`, { method:"POST", body:JSON.stringify(body ?? {}) });
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    return json(200, { ok:true, service:"project-zero-db-gateway" });
  }
  if (req.method !== "POST") return json(405, { ok:false, code:"METHOD_NOT_ALLOWED" });
  if (!(await authorized(req))) return json(401, { ok:false, code:"UNAUTHORIZED" });

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json(400, { ok:false, code:"INVALID_JSON" }); }

  const op = String(input.op || "");
  if (op === "rpc") {
    const name = String(input.name || "");
    const allowed = new Set([
      "x1_lease_next_work",
      "x1_finish_work",
      "x1_claim_execution",
      "x1_complete_execution",
      "x1_fail_execution",
      "x1_assert_worker_identity",
    ]);
    if (!allowed.has(name)) return json(403, { ok:false, code:"RPC_NOT_ALLOWED" });
    const result = await rpc(name, input.body ?? {});
    return json(result.ok ? 200 : result.status, result.ok ? { ok:true, data:result.body } : { ok:false, code:"SUPABASE_RPC_FAILED", status:result.status });
  }

  if (op === "capability_lookup") {
    const tenantId = String(input.tenantId || "");
    const ids = Array.isArray(input.ids) ? input.ids.map(String) : [];
    if (!tenantId || ids.length === 0) return json(400, { ok:false, code:"INVALID_CAPABILITY_LOOKUP" });
    const quoted = ids.map(id => `"${id.replace(/"/g,'\\\"')}"`).join(",");
    const path = `x1_capability_registry?select=capability_id,available,authorized,fresh,validated,platform_gated,source,capability_version,last_verified_at&tenant_id=eq.${encodeURIComponent(tenantId)}&capability_id=in.(${encodeURIComponent(quoted)})`;
    const result = await admin(path, { method:"GET" });
    return json(result.ok ? 200 : result.status, result.ok ? { ok:true, data:result.body } : { ok:false, code:"CAPABILITY_LOOKUP_FAILED", status:result.status });
  }

  if (op === "persist_authorization") {
    const result = await admin("x1_bootstrap_authorizations", {
      method:"POST",
      headers:{ Prefer:"return=minimal" },
      body:JSON.stringify(input.row ?? {}),
    });
    return json(result.ok ? 200 : result.status, result.ok ? { ok:true } : { ok:false, code:"AUTHORIZATION_PERSIST_FAILED", status:result.status });
  }

  if (op === "persist_receipt") {
    const result = await admin("x1_bootstrap_receipts", {
      method:"POST",
      headers:{ Prefer:"return=minimal" },
      body:JSON.stringify(input.row ?? {}),
    });
    return json(result.ok ? 200 : result.status, result.ok ? { ok:true } : { ok:false, code:"RECEIPT_PERSIST_FAILED", status:result.status });
  }

  return json(400, { ok:false, code:"UNKNOWN_OPERATION" });
});
