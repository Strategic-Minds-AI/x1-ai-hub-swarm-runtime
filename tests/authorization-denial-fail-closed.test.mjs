import test from "node:test";
import assert from "node:assert/strict";
import { processNextWork } from "../dist/index.js";

const work = {
  work_id:"11111111-1111-1111-1111-111111111111",
  work_packet_id:"X1-SYNTHETIC-AUTH",
  task_id:"synthetic-auth",
  tenant_id:"00000000-0000-0000-0000-000000000001",
  action_class:"READ_ONLY",
  required_capabilities:[{id:"verified-read",mechanism:"skill"}],
  idempotency_key:"x".repeat(64),
  attempt:1,
  lease:{leaseId:"synthetic-lease",holderAgentId:"worker-1",taskId:"synthetic-auth",acquiredAt:"2026-10-11T00:00:00Z",expiresAt:"2099-01-01T00:00:00Z"}
};

async function runDenied(errorCode) {
  const finishes=[];
  let handlerCalls=0;
  const result=await processNextWork({
    queue:{leaseNextWork:async()=>work,finishWork:async(_work,status,code)=>finishes.push({status,code})},
    controlPlane:{requestMandatoryAuthorization:async()=>{throw new Error(errorCode);}},
    bootstrapSigningKey:"synthetic-only",
    workerId:"worker-1",
    handler:async()=>{handlerCalls++;},
  });
  return {result,finishes,handlerCalls};
}

test("HTTP 401 control-plane denial blocks work without executing handler",async()=>{
  const x=await runDenied("CONTROL_PLANE_AUTHORIZATION_FAILED:401:UNAUTHORIZED");
  assert.equal(x.result.status,"BLOCKED");
  assert.deepEqual(x.finishes,[{status:"BLOCKED",code:"CONTROL_PLANE_AUTHORIZATION_FAILED"}]);
  assert.equal(x.handlerCalls,0);
});

test("HTTP 503 authorization failure also fails closed rather than retrying",async()=>{
  const x=await runDenied("CONTROL_PLANE_AUTHORIZATION_FAILED:503:AUTH_BACKEND_UNAVAILABLE");
  assert.equal(x.result.status,"BLOCKED");
  assert.equal(x.handlerCalls,0);
});

test("missing control-plane token is blocked",async()=>{
  const x=await runDenied("CONTROL_PLANE_INTERNAL_TOKEN_REQUIRED");
  assert.equal(x.result.status,"BLOCKED");
  assert.equal(x.handlerCalls,0);
});

test("authorization fetch unavailability is blocked",async()=>{
  const x=await runDenied("CONTROL_PLANE_FETCH_UNAVAILABLE");
  assert.equal(x.result.status,"BLOCKED");
  assert.equal(x.handlerCalls,0);
});

test("unrelated transient failure remains failed for bounded retry policy",async()=>{
  const x=await runDenied("NETWORK_TIMEOUT:upstream");
  assert.equal(x.result.status,"FAILED");
  assert.deepEqual(x.finishes,[{status:"FAILED",code:"NETWORK_TIMEOUT"}]);
  assert.equal(x.handlerCalls,0);
});
