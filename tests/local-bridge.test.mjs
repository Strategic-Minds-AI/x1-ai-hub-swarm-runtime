import test from "node:test";
import assert from "node:assert/strict";
import { LocalControlPlaneDispatcher } from "../dist/local-control-plane-dispatcher.js";

function response(body,status=200) {
  return {
    ok:status>=200 && status<300,
    status,
    async text(){ return JSON.stringify(body); },
  };
}

function leasedWork(overrides={}) {
  return {
    work_id:"11111111-1111-1111-1111-111111111111",
    work_packet_id:"WP-POWER-GRID-TEST",
    task_id:"power-grid.canary.test",
    tenant_id:"00000000-0000-0000-0000-000000000001",
    requested_by:"test",
    action_class:"READ_ONLY",
    required_capabilities:[],
    payload:{execution_target:"jarvis-local",local_agent:"code_architect",local_task_type:"agent_request"},
    source_sha:"test-sha",
    idempotency_key:"power-grid-test-idempotency",
    attempt:1,
    lease:{
      leaseId:"lease-1",
      taskId:"power-grid.canary.test",
      holderAgentId:"jarvis-local-test",
      acquiredAt:new Date().toISOString(),
      expiresAt:new Date(Date.now()+60000).toISOString(),
    },
    ...overrides,
  };
}

test("dispatch creates a local task and waits for completion", async()=>{
  const calls=[];
  let reads=0;
  const dispatcher=new LocalControlPlaneDispatcher({
    baseUrl:"http://local-control",
    pollIntervalMs:100,
    timeoutMs:2000,
    fetchImpl:async(url,init)=>{
      const body=JSON.parse(init.body);
      calls.push({url,body});
      if(url.endsWith("/create")) return response({id:"local-task-1"});
      reads++;
      return response(reads===1 ? {id:"local-task-1",status:"in_progress"} : {id:"local-task-1",status:"completed",result:"ok"});
    },
  });

  const out=await dispatcher.dispatch(leasedWork());
  assert.equal(out.status,"completed");
  assert.equal(out.localTaskId,"local-task-1");
  assert.equal(calls[0].body.data.agent_name,"code_architect");
  assert.equal(calls[0].body.data.autonomous,true);
});

test("dispatch fails closed for non-local targets", async()=>{
  const dispatcher=new LocalControlPlaneDispatcher({
    baseUrl:"http://local-control",
    fetchImpl:async()=>response({}),
  });
  await assert.rejects(
    dispatcher.dispatch(leasedWork({payload:{execution_target:"railway"}})),
    /LOCAL_BRIDGE_TARGET_MISMATCH/,
  );
});

test("dispatch fails closed for mutation action classes", async()=>{
  const dispatcher=new LocalControlPlaneDispatcher({
    baseUrl:"http://local-control",
    fetchImpl:async()=>response({}),
  });
  await assert.rejects(
    dispatcher.dispatch(leasedWork({action_class:"NON_PRODUCTION_MUTATION"})),
    /LOCAL_BRIDGE_READ_ONLY_REQUIRED/,
  );
});
