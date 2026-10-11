/// <reference lib="dom" />
// Staging-only read adapter. This module never invokes Docker mutation operations.
export type DockerProbe = "health" | "version";
export interface DockerBridgeOptions {
  url: string;
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}
export class DockerBridgeError extends Error {
  constructor(public readonly code: string) { super(code); this.name = "DockerBridgeError"; }
}
export function createDockerBridge(opts: DockerBridgeOptions) {
  let origin: URL;
  try { origin = new URL(opts.url); }
  catch { throw new DockerBridgeError("BRIDGE_URL_INVALID"); }
  // Reject credentials, query/path fragments and plaintext HTTP, even for staging.
  if (origin.protocol !== "https:" || origin.username || origin.password ||
      origin.search || origin.hash || origin.pathname !== "/" ||
      !origin.hostname || origin.port) throw new DockerBridgeError("BRIDGE_URL_UNSAFE");
  if (!opts.token || /[\r\n]/.test(opts.token)) throw new DockerBridgeError("BRIDGE_TOKEN_INVALID");
  const timeoutMs = opts.timeoutMs ?? 5000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10000)
    throw new DockerBridgeError("BRIDGE_TIMEOUT_INVALID");
  const transport = opts.fetchImpl ?? fetch;
  return Object.freeze({
    async probe(kind: DockerProbe): Promise<unknown> {
      if (kind !== "health" && kind !== "version") throw new DockerBridgeError("BRIDGE_ACTION_DENIED");
      const endpoint = kind === "health" ? "/health" : "/docker/version";
      let result: Response;
      try {
        result = await transport(new URL(endpoint, origin), {
          method: "GET",
          headers: { Authorization: "Bearer " + opts.token, Accept: "application/json" },
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch { throw new DockerBridgeError("BRIDGE_TRANSPORT_FAILED"); }
      if (result.status === 401 || result.status === 403) throw new DockerBridgeError("BRIDGE_UNAUTHORIZED");
      if (!result.ok) throw new DockerBridgeError("BRIDGE_HTTP_ERROR");
      if (!(result.headers.get("content-type") ?? "").toLowerCase().includes("application/json"))
        throw new DockerBridgeError("BRIDGE_CONTENT_TYPE_INVALID");
      const declared = Number(result.headers.get("content-length") ?? 0);
      if (declared > 4096) throw new DockerBridgeError("BRIDGE_RESPONSE_TOO_LARGE");
      let body: string;
      try { body = await result.text(); }
      catch { throw new DockerBridgeError("BRIDGE_READ_FAILED"); }
      if (body.length > 4096) throw new DockerBridgeError("BRIDGE_RESPONSE_TOO_LARGE");
      try { return JSON.parse(body) as unknown; }
      catch { throw new DockerBridgeError("BRIDGE_JSON_INVALID"); }
    }
  });
}
