import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

function listen(server) {
  return new Promise(resolve=>server.listen(0,"127.0.0.1",()=>resolve(server.address().port)));
}
async function sparePort() {
  const server=createServer((_req,res)=>res.end("unused"));
  const port=await listen(server);
  await new Promise(resolve=>server.close(resolve));
  return port;
}
async function waitFor(url,predicate,deadlineMs=6500) {
  const stop=Date.now()+deadlineMs;
  while(Date.now()<stop){
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(700)});
      const data=await response.json();
      if(predicate(response,data))return {response,data};
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,120));
  }
  throw new Error("WORKER_HEALTH_TEST_TIMEOUT");
}

test("Railway /healthz remains live when a failed queue dependency makes /readyz fail closed",{
  timeout:14000,
},async()=>{
  const gateway=createServer((_req,res)=>{
    res.writeHead(503,{"content-type":"application/json"});
    res.end(JSON.stringify({ok:false,code:"STAGING_PROVIDER_UNAVAILABLE"}));
  });
  const gatewayPort=await listen(gateway);
  const port=await sparePort();
  const child=spawn(process.execPath,["dist/worker-main-gateway.js"],{
    env:{
      ...process.env,PORT:String(port),
      X1_WORKER_ID:"x1-synthetic-test-worker",
      X1_RUNTIME_ENV:"preview",
      X1_SYSTEM_TENANT_ID:"00000000-0000-4000-8000-000000000001",
      X1_CONTROL_PLANE_URL:"http://127.0.0.1:"+gatewayPort,
      X1_DB_GATEWAY_URL:"http://127.0.0.1:"+gatewayPort,
      X1_INTERNAL_SERVICE_TOKEN:"synthetic-ci-only",
      X1_WORKER_POLL_MS:"1000",
    },
    stdio:["ignore","pipe","pipe"],
  });
  let output="";
  child.stdout.on("data",b=>{output+=String(b).slice(-600);});
  child.stderr.on("data",b=>{output+=String(b).slice(-600);});
  try{
    const h=await waitFor("http://127.0.0.1:"+port+"/healthz",
      (response,data)=>response.status===200 && data.lastTick?.status==="FAILED");
    assert.equal(h.data.ok,true);
    assert.equal(h.data.runtime,"preview");
    const ready=await fetch("http://127.0.0.1:"+port+"/readyz");
    assert.equal(ready.status,503);
    assert.equal((await ready.json()).ok,false);
  }finally{
    child.kill("SIGTERM");
    const code=await Promise.race([
      new Promise(resolve=>child.once("exit",(code,signal)=>resolve({code,signal}))),
      new Promise(resolve=>setTimeout(()=>resolve({timeout:true}),3000)),
    ]);
    if(code.timeout)child.kill("SIGKILL");
    await new Promise(resolve=>gateway.close(resolve));
    assert.equal(code.timeout,undefined,"worker did not drain quickly: "+output);
  }
});
