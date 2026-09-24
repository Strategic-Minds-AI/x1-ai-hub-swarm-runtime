import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  ControlPlaneClient,
  SupabaseWorkQueue,
  processNextWork,
  InMemoryExecutionLedger,
} from "../dist/index.js";

function response(body,status=200){
  return {ok:status>=200&&status<300,status,text:async()=>body};
}

function canonicalize(value){
  if(Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if(value&&typeof value==="object"){
    return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function authorization({allowed=true,tenant="00000000-0000-0000-0000-000000000001",agent="worker-1",task="task-1"}={}){
  const unsigned={
    authorization_id:"auth-1",task_id:task,agent_id:agent,tenant_id:tenant,requested_action:"READ_ONLY",
    capabilities_required:["skill-creator"],capabilities_resolved:allowed?["skill-creator"]:[],
    capability_sources:allowed?{"skill-creator":"catalog"}:{},policy_version:"p1",registry_version:"r1",
    issued_at:"2026-09-24T10:00:00.000Z",expires_at:"2099-09-24T10:05:00.000Z",
    allowed,blockers:allowed?[]:[{capabilityId:"skill-creator",state:"MISSING_SKILL",closure:"CREATE_SKILL",detail:"missing"}],
    receipt_id:"receipt-1",
  };
  return {...unsigned,signature:{algorithm:"HMAC-SHA256",value:createHmac("sha256","signing-key").update(canonicalize(unsigned)).digest("hex")}};
}

function leasedWork(){
  return {
    work_id:"11111111-1111-1111-1111-111111111111",
    work_packet_id:"WP-TEST",
    task_id:"task-1",
    tenant_id:"00000000-0000-0000-0000-000000000001",
    requested_by:"test",
    action_class:"READ_ONLY",
    required_capabilities:[{id:"skill-creator",mechanism:"skill"}],
    payload:{},
    source_sha:null,
    idempotency_key:"a".repeat(64),
    approval_reference:null,
    validation_receipt_id:null,
    rollback_reference:null,
    attempt:1,
    lease:{
      leaseId:"lease-1",taskId:"task-1",holderAgentId:"worker-1",
      acquiredAt:"2026-09-24T10:00:00.000Z",expiresAt:"2099-09-24T10:05:00.000Z",
    },
  };
}

test("control-plane client accepts a signed blocked authorization from HTTP 403",async()=>{
  const auth=authorization({allowed:false});
  const client=new ControlPlaneClient({
    baseUrl:"https://control.example",
    internalServiceToken:"internal",
    fetchImpl:async()=>response(JSON.stringify({ok:false,code:"CAPABILITY_BOOTSTRAP_BLOCKED",authorization:auth}),403),
  });
  assert.equal((await client.requestMandatoryAuthorization({
    taskId:"task-1",agentId:"worker-1",tenantId:auth.tenant_id,requestedAction:"READ_ONLY",
    requiredCapabilities:[{id:"skill-creator",mechanism:"skill"}],
  })).allowed,false);
});

test("work queue client leases and finishes durable work",async()=>{
  const calls=[];
  const work=leasedWork();
  const queue=new SupabaseWorkQueue({
    url:"https://supabase.example",serviceRoleKey:"runtime-key",tenantId:work.tenant_id,
    workerId:"worker-1",environment:"preview",
    fetchImpl:async(url,init)=>{
      calls.push({url,body:JSON.parse(init.body)});
      return url.endsWith("/x1_lease_next_work") ? response(JSON.stringify(work)) : response("");
    },
  });
  assert.equal((await queue.leaseNextWork()).work_id,work.work_id);
  await queue.finishWork(work,"COMPLETED");
  assert.match(calls[0].url,/x1_lease_next_work$/);
  assert.match(calls[1].url,/x1_finish_work$/);
  assert.doesNotMatch(calls[0].url,/runtime-key/);
});

test("worker executes only after allowed authorization",async()=>{
  const work=leasedWork();
  const finishes=[];
  const queue={
    leaseNextWork:async()=>work,
    finishWork:async(_work,status,code)=>finishes.push({status,code}),
  };
  const cp={requestMandatoryAuthorization:async()=>authorization()};
  let handled=false;
  const result=await processNextWork({
    queue,controlPlane:cp,bootstrapSigningKey:"signing-key",serviceRoleKey:"runtime-key",
    supabaseUrl:"https://supabase.example",workerId:"worker-1",
    ledgerFactory:()=>new InMemoryExecutionLedger(),
    handler:async()=>{handled=true;return "done";},
  });
  assert.equal(result.status,"COMPLETED");
  assert.equal(result.output,"done");
  assert.equal(handled,true);
  assert.deepEqual(finishes,[{status:"COMPLETED",code:undefined}]);
});

test("blocked authorization never invokes handler and freezes work",async()=>{
  const work=leasedWork();
  const finishes=[];
  const queue={
    leaseNextWork:async()=>work,
    finishWork:async(_work,status,code)=>finishes.push({status,code}),
  };
  const cp={requestMandatoryAuthorization:async()=>authorization({allowed:false})};
  let handled=false;
  const result=await processNextWork({
    queue,controlPlane:cp,bootstrapSigningKey:"signing-key",serviceRoleKey:"runtime-key",
    supabaseUrl:"https://supabase.example",workerId:"worker-1",
    ledgerFactory:()=>new InMemoryExecutionLedger(),
    handler:()=>{handled=true;},
  });
  assert.equal(result.status,"BLOCKED");
  assert.equal(handled,false);
  assert.deepEqual(finishes,[{status:"BLOCKED",code:"CAPABILITY_BOOTSTRAP_BLOCKED"}]);
});

test("idle worker does nothing when queue is empty",async()=>{
  const result=await processNextWork({
    queue:{leaseNextWork:async()=>null,finishWork:async()=>{}},
    controlPlane:{requestMandatoryAuthorization:async()=>{throw new Error("should not call");}},
    bootstrapSigningKey:"signing-key",serviceRoleKey:"runtime-key",
    supabaseUrl:"https://supabase.example",workerId:"worker-1",handler:()=>{},
  });
  assert.equal(result.status,"IDLE");
});
