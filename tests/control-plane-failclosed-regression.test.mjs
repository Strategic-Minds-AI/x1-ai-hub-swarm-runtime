import test from "node:test";
import assert from "node:assert/strict";
import { ControlPlaneClient } from "../dist/control-plane-client.js";

const input = {
  taskId: "synthetic-auth-guard",
  agentId: "test-worker",
  tenantId: "test-tenant",
  requestedAction: "READ_ONLY",
  requiredCapabilities: [],
};
function client(status, authorization) {
  return new ControlPlaneClient({
    baseUrl: "https://control.invalid",
    internalServiceToken: "synthetic-test-token",
    fetchImpl: async () => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify({ authorization }),
    }),
  });
}
test("HTTP 403 never grants an allow authorization", async () => {
  await assert.rejects(
    client(403, { allowed: true }).requestMandatoryAuthorization(input),
    /CONTROL_PLANE_AUTHORIZATION_FAILED:403/,
  );
});
test("HTTP 403 preserves explicit denial for downstream blocked handling", async () => {
  const response = await client(403, { allowed: false }).requestMandatoryAuthorization(input);
  assert.equal(response.allowed, false);
});
test("HTTP 200 preserves an allow authorization", async () => {
  const response = await client(200, { allowed: true }).requestMandatoryAuthorization(input);
  assert.equal(response.allowed, true);
});
test("HTTP 200 without explicit allow fails closed", async () => {
  await assert.rejects(
    client(200, { allowed: false }).requestMandatoryAuthorization(input),
    /CONTROL_PLANE_AUTHORIZATION_FAILED:200/,
  );
});
