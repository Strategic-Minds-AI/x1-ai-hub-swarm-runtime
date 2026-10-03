import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkerIdentity } from "../dist/worker-identity.js";
import { SupabaseWorkQueue } from "../dist/work-queue-client.js";

function response(data,status=200) {
  return {
    ok:status>=200 && status<300,
    status,
    async text(){ return JSON.stringify(data); },
  };
}

const identity=()=>buildWorkerIdentity({
  workerId:"jarvis-local-power-grid-1",
  tenantId:"00000000-0000-4000-8000-000000000001",
  executionPlane:"jarvis-local",
  environment:"preview",
  identityVersion:"power-grid-bridge-v1",
  artifactDigest:"sha256:"+"a".repeat(64),
  credentialId:"jarvis-staging-credential-1",
  allowedActionClasses:["READ_ONLY"],
  allowedCapabilities:["local-agent-request","local-control-plane-dispatch"],
});

test("worker identity fingerprint is deterministic",()=>{
  const a=identity(), b=identity();
  assert.equal(a.identityFingerprint,b.identityFingerprint);
  assert.match(a.identityFingerprint,/^[0-9a-f]{64}$/);
});

test("worker identity rejects malformed artifact digest",()=>{
  assert.throws(()=>buildWorkerIdentity({
    ...identity(),
    artifactDigest:"latest",
  }),/WORKER_IDENTITY_ARTIFACT_DIGEST_INVALID/);
});

test("registered identity is asserted before lease",async()=>{
  const calls=[];
  const queue=new SupabaseWorkQueue({
    gatewayUrl:"https://gateway.test",
    internalServiceToken:"test-token",
    tenantId:identity().tenantId,
    workerId:identity().workerId,
    environment:"preview",
    requireRegisteredIdentity:true,
    workerIdentity:identity(),
    fetchImpl:async(_url,init)=>{
      const body=JSON.parse(init.body);
      calls.push(body);
      if(body.name==="x1_assert_worker_identity") return response({ok:true,data:{ok:true}});
      if(body.name==="x1_lease_next_work") return response({ok:true,data:null});
      throw new Error("unexpected rpc");
    },
  });
  assert.equal(await queue.leaseNextWork(),null);
  assert.equal(calls[0].name,"x1_assert_worker_identity");
  assert.equal(calls[1].name,"x1_lease_next_work");
});

test("identity rejection prevents lease",async()=>{
  const calls=[];
  const queue=new SupabaseWorkQueue({
    gatewayUrl:"https://gateway.test",
    internalServiceToken:"test-token",
    tenantId:identity().tenantId,
    workerId:identity().workerId,
    environment:"preview",
    requireRegisteredIdentity:true,
    workerIdentity:identity(),
    fetchImpl:async(_url,init)=>{
      const body=JSON.parse(init.body); calls.push(body);
      return response({ok:false,code:"WORKER_IDENTITY_REJECTED"},403);
    },
  });
  await assert.rejects(queue.leaseNextWork(),/WORK_QUEUE_GATEWAY_FAILED/);
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,"x1_assert_worker_identity");
});

test("identity context mismatch fails at construction",()=>{
  assert.throws(()=>new SupabaseWorkQueue({
    gatewayUrl:"https://gateway.test",
    internalServiceToken:"test-token",
    tenantId:identity().tenantId,
    workerId:"jarvis-local-other",
    environment:"preview",
    requireRegisteredIdentity:true,
    workerIdentity:identity(),
  }),/WORKER_IDENTITY_WORKER_CONTEXT_MISMATCH/);
});
