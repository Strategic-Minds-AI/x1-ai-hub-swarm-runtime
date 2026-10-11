import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  executeAuthorizedTask, processNextWork, ControlPlaneClient, SupabaseWorkQueue,
  SupabaseExecutionLedger,
} from "../dist/index.js";
import { SingleFlightGate } from "../dist/single-flight.js";

const tenant="00000000-0000-0000-0000-000000000001";
const otherTenant="00000000-0000-0000-0000-000000000002";
const key="synthetic-x1-ci-signing-key";
function stable(v) {
  if(Array.isArray(v)) return "["+v.map(stable).join(",")+"]";
  if(v && typeof v==="object") return "{"+Object.entries(v)
    .sort(([a],[b])=>a.localeCompare(b))
    .map(([k,val])=>JSON.stringify(k)+":"+stable(val)).join(",")+"}";
  return JSON.stringify(v);
}
function authorization(overrides={}) {
  const a={
    authorization_id:"auth-synthetic",task_id:"task-1",agent_id:"worker-1",tenant_id:tenant,
    requested_action:"READ_ONLY",capabilities_required:[],capabilities_resolved:[],
    capability_sources:{},policy_version:"test",registry_version:"test",
    issued_at:new Date(Date.now()-60_000).toISOString(),expires_at:new Date(Date.now()+240_000).toISOString(),
    allowed:true,blockers:[],receipt_id:"receipt-synthetic",
  };
  Object.assign(a,overrides);
  return {...a,signature:{algorithm:"HMAC-SHA256",
    value:createHmac("sha256",key).update(stable(a)).digest("hex")}};
}
function work(overrides={}) {
  return {
    work_id:"11111111-1111-4111-8111-111111111111",
    task_id:"task-1",work_packet_id:"packet-1",mission_id:null,tenant_id:tenant,
    action_class:"READ_ONLY",required_capabilities:[],payload:{},
    idempotency_key:"a".repeat(64),attempt:1,source_sha:null,
    lease:{leaseId:"lease-1",taskId:"task-1",holderAgentId:"worker-1",
      acquiredAt:new Date(Date.now()-60_000).toISOString(),expiresAt:new Date(Date.now()+240_000).toISOString()},
    ...overrides,
  };
}
function queueAndControl(ledger,handler=async()=>"done",workPacket=work()) {
  const finishes=[];
  const queue={
    leaseNextWork:async()=>workPacket,
    finishWork:async(_item,status,code)=>finishes.push({status,code}),
  };
  return {
    finishes,queue,
    args:{queue,controlPlane:{requestMandatoryAuthorization:async()=>authorization()},
      bootstrapSigningKey:key,workerId:"worker-1",
      ledgerFactory:()=>ledger,handler},
  };
}
test("successful handler with missing queue acknowledgment never sends contradictory FAILED",async()=>{
  let didComplete=false;
  let failed=0;
  const ledger={tryStart:async()=>true,complete:async()=>{didComplete=true;},
    fail:async()=>{failed++;}};
  const {args,queue,finishes}=queueAndControl(ledger);
  queue.finishWork=async(_item,status,code)=>{
    finishes.push({status,code});
    throw new Error("PROVIDER_ACK_TIMEOUT");
  };
  const result=await processNextWork(args);
  assert.equal(result.code,"QUEUE_COMPLETION_UNCONFIRMED");
  assert.equal(result.status,"FAILED");
  assert.equal(didComplete,true);
  assert.equal(failed,0);
  assert.deepEqual(finishes,[{status:"COMPLETED",code:undefined}]);
});
test("ledger completion uncertainty leaves original lease for reconciliation",async()=>{
  let failed=0;
  const ledger={tryStart:async()=>true,complete:async()=>{throw new Error("RPC_DISCONNECT");},
    fail:async()=>{failed++;}};
  const {args,finishes}=queueAndControl(ledger);
  const result=await processNextWork(args);
  assert.equal(result.code,"EXECUTION_COMPLETION_UNCONFIRMED");
  assert.equal(result.status,"FAILED");
  assert.deepEqual(finishes,[]);
  assert.equal(failed,0);
});
test("handler-failure receipt uncertainty does not invent a queue FAILED state",async()=>{
  const ledger={tryStart:async()=>true,complete:async()=>{},
    fail:async()=>{throw new Error("LEDGER_DOWN");}};
  const {args,finishes}=queueAndControl(ledger,async()=>{throw new Error("HANDLER_FAILURE");});
  const result=await processNextWork(args);
  assert.equal(result.code,"EXECUTION_FAILURE_RECEIPT_UNCONFIRMED");
  assert.deepEqual(finishes,[]);
});
test("confirmed handler failure finalizes queue once as FAILED",async()=>{
  let ledgerFailures=0;
  const ledger={tryStart:async()=>true,complete:async()=>{},
    fail:async()=>{ledgerFailures++;}};
  const {args,finishes}=queueAndControl(ledger,async()=>{throw new Error("HANDLER_FAILURE");});
  const result=await processNextWork(args);
  assert.equal(result.status,"FAILED");
  assert.equal(ledgerFailures,1);
  assert.deepEqual(finishes,[{status:"FAILED",code:"HANDLER_FAILURE"}]);
});
test("duplicate claim never executes handler and is frozen BLOCKED",async()=>{
  let invoked=0;
  const ledger={tryStart:async()=>false,complete:async()=>{},fail:async()=>{}};
  const {args,finishes}=queueAndControl(ledger,async()=>{invoked++;});
  const result=await processNextWork(args);
  assert.equal(result.status,"BLOCKED");
  assert.equal(result.code,"DUPLICATE_EXECUTION");
  assert.equal(invoked,0);
  assert.deepEqual(finishes,[{status:"BLOCKED",code:"DUPLICATE_EXECUTION"}]);
});
test("direct authorized execution still succeeds with durable ledger",async()=>{
  const ctx={taskId:"task-1",agentId:"worker-1",tenantId:tenant,requestedAction:"READ_ONLY"};
  let completed=0;
  const output=await executeAuthorizedTask({
    authorization:authorization(),context:ctx,lease:work().lease,signingKey:key,
    ledger:{tryStart:async()=>true,complete:async()=>{completed++;},fail:async()=>{}},
    handler:async()=>"success",
  });
  assert.equal(output,"success");
  assert.equal(completed,1);
});
test("control-plane authorization request times out and aborts without retry",async()=>{
  let attempts=0,signal;
  const client=new ControlPlaneClient({
    baseUrl:"https://control.example",internalServiceToken:"synthetic",requestTimeoutMs:60,
    fetchImpl:async(_url,init)=>{attempts++;signal=init.signal;return new Promise(()=>{});},
  });
  await assert.rejects(()=>client.requestMandatoryAuthorization({
    taskId:"task-1",agentId:"worker-1",tenantId:tenant,
    requestedAction:"READ_ONLY",requiredCapabilities:[],
  }),/CONTROL_PLANE_AUTHORIZATION_TIMEOUT/);
  assert.equal(attempts,1);
  assert.equal(signal.aborted,true);
});
test("queue RPC is deadline-bounded even when fetch never resolves",async()=>{
  let attempts=0;
  const queue=new SupabaseWorkQueue({
    url:"https://db.example",serviceRoleKey:"synthetic",tenantId:tenant,
    workerId:"worker-1",environment:"preview",requestTimeoutMs:60,
    fetchImpl:async()=>{attempts++;return new Promise(()=>{});},
  });
  await assert.rejects(()=>queue.leaseNextWork(),/WORK_QUEUE_RPC_TIMEOUT/);
  assert.equal(attempts,1);
});
test("ledger RPC is deadline-bounded and not automatically retried",async()=>{
  let attempts=0;
  const ledger=new SupabaseExecutionLedger({
    url:"https://db.example",serviceRoleKey:"synthetic",tenantId:tenant,
    agentId:"worker-1",idempotencyKey:"f".repeat(64),
    attempt:1,completionReceiptId:"receipt-ci",requestTimeoutMs:60,
    fetchImpl:async()=>{attempts++;return new Promise(()=>{});},
  });
  await assert.rejects(()=>ledger.tryStart("task-1","lease-1"),/LEDGER_RPC_TIMEOUT/);
  assert.equal(attempts,1);
});
test("a worker rejects a lease belonging to another tenant",async()=>{
  const fakeQueue=new SupabaseWorkQueue({
    url:"https://db.example",serviceRoleKey:"synthetic",tenantId:tenant,
    workerId:"worker-1",environment:"preview",
    fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify(work({tenant_id:otherTenant}))}),
  });
  await assert.rejects(()=>fakeQueue.leaseNextWork(),/WORK_QUEUE_LEASE_CONTEXT_MISMATCH/);
});
test("a worker rejects a lease assigned to another worker",async()=>{
  const leased=work();
  leased.lease={...leased.lease,holderAgentId:"worker-2"};
  const fakeQueue=new SupabaseWorkQueue({
    url:"https://db.example",serviceRoleKey:"synthetic",tenantId:tenant,
    workerId:"worker-1",environment:"preview",
    fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify(leased)}),
  });
  await assert.rejects(()=>fakeQueue.leaseNextWork(),/WORK_QUEUE_LEASE_CONTEXT_MISMATCH/);
});
test("single-flight wrapper never overlaps competing poll ticks",async()=>{
  const gate=new SingleFlightGate();
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  let calls=0;
  const a=gate.run(async()=>{calls++;await pending;});
  const b=gate.run(async()=>{calls++;await pending;});
  await Promise.resolve();
  assert.equal(calls,1);
  assert.equal(gate.busy,true);
  release();
  await Promise.all([a,b]);
  assert.equal(calls,1);
  assert.equal(gate.busy,false);
});
test("shutdown waits for an in-flight poll then rejects new ticks",async()=>{
  const gate=new SingleFlightGate();
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  let calls=0;
  const active=gate.run(async()=>{calls++;await pending;});
  const drain=gate.stopAndDrain(1000);
  release();
  assert.equal(await drain,true);
  await active;
  await gate.run(async()=>{calls++;});
  assert.equal(gate.stopping,true);
  assert.equal(calls,1);
});
test("a stuck tick triggers bounded shutdown without false completion",async()=>{
  const gate=new SingleFlightGate();
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  const active=gate.run(async()=>{await pending;});
  assert.equal(await gate.stopAndDrain(60),false);
  assert.equal(gate.stopping,true);
  release();
  await active;
});


test("wrong action class is rejected even with a valid signature",async()=>{
  const auth=authorization();
  const ctx={taskId:"task-1",agentId:"worker-1",tenantId:tenant,
    requestedAction:"PRODUCTION_RELEASE"};
  await assert.rejects(()=>executeAuthorizedTask({
    authorization:auth,context:ctx,lease:work().lease,signingKey:key,
    ledger:{tryStart:async()=>true,complete:async()=>{},fail:async()=>{}},
    handler:async()=>{throw new Error("MUST_NOT_RUN");},
  }),/AUTHORIZATION_ACTION_MISMATCH/);
});
test("invalid signed authorization expiry fails closed",async()=>{
  const auth=authorization({expires_at:"not-a-date"});
  const ctx={taskId:"task-1",agentId:"worker-1",tenantId:tenant,
    requestedAction:"READ_ONLY"};
  await assert.rejects(()=>executeAuthorizedTask({
    authorization:auth,context:ctx,lease:work().lease,signingKey:key,
    ledger:{tryStart:async()=>true,complete:async()=>{},fail:async()=>{}},
    handler:async()=>{},
  }),/AUTHORIZATION_TIME_WINDOW_INVALID/);
});
test("long-lived signed authorization is rejected",async()=>{
  const auth=authorization({expires_at:new Date(Date.now()+24*60*60*1000).toISOString()});
  const ctx={taskId:"task-1",agentId:"worker-1",tenantId:tenant,
    requestedAction:"READ_ONLY"};
  await assert.rejects(()=>executeAuthorizedTask({
    authorization:auth,context:ctx,lease:work().lease,signingKey:key,
    ledger:{tryStart:async()=>true,complete:async()=>{},fail:async()=>{}},
    handler:async()=>{},
  }),/AUTHORIZATION_TIME_WINDOW_INVALID/);
});
test("invalid lease timestamps do not pass expiry comparisons",async()=>{
  const ctx={taskId:"task-1",agentId:"worker-1",tenantId:tenant,
    requestedAction:"READ_ONLY"};
  const invalidLease={...work().lease,expiresAt:"definitely-not-a-date"};
  await assert.rejects(()=>executeAuthorizedTask({
    authorization:authorization(),context:ctx,lease:invalidLease,signingKey:key,
    ledger:{tryStart:async()=>true,complete:async()=>{},fail:async()=>{}},
    handler:async()=>{},
  }),/LEASE_TIME_WINDOW_INVALID/);
});
test("uncertain ledger claim leaves queue leased, with no execution or second finalize",async()=>{
  let executed=0;
  const ledger={tryStart:async()=>{throw new Error("NETWORK_LOST_AFTER_CLAIM");},
    complete:async()=>{},fail:async()=>{}};
  const {args,finishes}=queueAndControl(ledger,async()=>{executed++;});
  const result=await processNextWork(args);
  assert.equal(result.status,"FAILED");
  assert.equal(result.code,"EXECUTION_CLAIM_UNCONFIRMED");
  assert.deepEqual(finishes,[]);
  assert.equal(executed,0);
});
