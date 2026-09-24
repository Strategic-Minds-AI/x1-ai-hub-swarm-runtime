import { createHmac, timingSafeEqual } from "node:crypto";
import type { BootstrapAuthorization, ExecutionContext } from "./types.js";

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function unsignedAuthorization(authorization: BootstrapAuthorization): Record<string, unknown> {
  const { signature: _signature, ...unsigned } = authorization;
  return unsigned;
}

function hexToBytes(hex: string): Uint8Array | undefined {
  if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 2 !== 0) return undefined;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    const value = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    if (!Number.isFinite(value)) return undefined;
    bytes[index] = value;
  }
  return bytes;
}

function sameHex(a: string, b: string): boolean {
  const left = hexToBytes(a);
  const right = hexToBytes(b);
  if (!left || !right || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyBootstrapAuthorization(
  authorization: BootstrapAuthorization | undefined,
  context: ExecutionContext,
  signingKey: string,
  now = new Date(),
): void {
  if (!authorization) throw new Error("AUTHORIZATION_REQUIRED");
  if (!signingKey) throw new Error("AUTHORIZATION_SIGNING_KEY_REQUIRED");
  if (!authorization.allowed) throw new Error("CAPABILITY_BOOTSTRAP_BLOCKED");
  if (authorization.task_id !== context.taskId || authorization.agent_id !== context.agentId || authorization.tenant_id !== context.tenantId) {
    throw new Error("AUTHORIZATION_CONTEXT_MISMATCH");
  }
  if (!authorization.receipt_id || !authorization.authorization_id) throw new Error("AUTHORIZATION_RECEIPT_REQUIRED");
  if (Date.parse(authorization.expires_at) <= now.getTime()) throw new Error("AUTHORIZATION_EXPIRED");
  if (authorization.signature.algorithm !== "HMAC-SHA256") throw new Error("AUTHORIZATION_SIGNATURE_ALGORITHM_INVALID");

  const expected = createHmac("sha256", signingKey)
    .update(canonicalize(unsignedAuthorization(authorization)))
    .digest("hex");
  if (!sameHex(expected, authorization.signature.value)) throw new Error("AUTHORIZATION_SIGNATURE_INVALID");
}
