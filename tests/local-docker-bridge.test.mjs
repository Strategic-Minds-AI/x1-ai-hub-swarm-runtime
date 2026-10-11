import test from "node:test";
import assert from "node:assert/strict";
import { createDockerBridge } from "../dist/local-docker-bridge.js";

const valid = { url: "https://docker.example.test/", token: "test-nonsecret" };
test("denies plain HTTP, embedded credentials, paths and unsafe token", () => {
  for (const url of ["http://localhost:8787/", "https://user:pw@example.test/", "https://example.test/other", "https://example.test/?x=1"]) {
    assert.throws(() => createDockerBridge({ ...valid, url }), /BRIDGE_URL_UNSAFE/);
  }
  assert.throws(() => createDockerBridge({ ...valid, token: "bad\nheader" }), /BRIDGE_TOKEN_INVALID/);
});
test("allows only two read endpoints, sends bearer and disallows redirects", async () => {
  const calls = [];
  const bridge = createDockerBridge({ ...valid, fetchImpl: async (url, init) => {
    calls.push({ path: url.pathname, method: init.method, redirect: init.redirect, auth: init.headers.Authorization });
    return new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } });
  } });
  assert.deepEqual(await bridge.probe("health"), { ok: true });
  assert.deepEqual(await bridge.probe("version"), { ok: true });
  assert.deepEqual(calls.map(x => x.path), ["/health", "/docker/version"]);
  assert.ok(calls.every(x => x.method === "GET" && x.redirect === "error" && x.auth === "Bearer test-nonsecret"));
  await assert.rejects(() => bridge.probe("containers"), /BRIDGE_ACTION_DENIED/);
});
test("fails closed on 401, oversized output, malformed JSON and transport errors", async () => {
  for (const [response, error] of [
    [new Response("no", {status:401}), /BRIDGE_UNAUTHORIZED/],
    [new Response("x".repeat(5000), {headers:{"content-type":"application/json"}}), /BRIDGE_RESPONSE_TOO_LARGE/],
    [new Response("bad", {headers:{"content-type":"application/json"}}), /BRIDGE_JSON_INVALID/],
  ]) {
    await assert.rejects(() => createDockerBridge({ ...valid, fetchImpl: async () => response }).probe("health"), error);
  }
  await assert.rejects(() => createDockerBridge({ ...valid, fetchImpl: async () => { throw new Error("secret!"); }}).probe("health"), /BRIDGE_TRANSPORT_FAILED/);
});
