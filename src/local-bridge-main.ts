/// <reference lib="dom" />
declare const process: {
  env: Record<string,string|undefined>;
  exit(code?:number): never;
  on(event:"SIGTERM"|"SIGINT", handler:()=>void): void;
};

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { ControlPlaneClient } from "./control-plane-client.js";
import { SupabaseWorkQueue } from "./work-queue-client.js";
import { processNextWork } from "./worker-orchestrator.js";
import { LocalControlPlaneDispatcher } from "./local-control-plane-dispatcher.js";

function required(name:string):string {
  const value=process.env[name];
  if(!value) throw new Error(`CONFIG_REQUIRED:${name}`);
  return value;
}

const port=Number(process.env.PORT ?? "4312");
if(!Number.isInteger(port) || port<=0 || port>65535) throw new Error("PORT_INVALID");

const workerId=process.env.X1_WORKER_ID ?? "jarvis-local-power-grid-1";
if(!workerId.startsWith("jarvis-local-")) throw new Error("X1_WORKER_ID_MUST_BE_JARVIS_LOCAL");

const environment=(process.env.X1_RUNTIME_ENV ?? "preview") as "development"|"preview"|"production";
if(environment!=="preview") throw new Error("LOCAL_POWER_GRID_PREVIEW_ONLY");

const tenantId=required("X1_SYSTEM_TENANT_ID");
const controlPlaneUrl=required("X1_CONTROL_PLANE_URL");
const dbGatewayUrl=required("X1_DB_GATEWAY_URL");
const internalToken=required("X1_INTERNAL_SERVICE_TOKEN");
const localControlPlaneUrl=process.env.LOCAL_CONTROL_PLANE_URL ?? "http://host.docker.internal:4311";

const signingKey=createHash("sha256")
  .update(`project-zero-bootstrap-signing-v1:${internalToken}`)
  .digest("hex");

const queue=new SupabaseWorkQueue({
  gatewayUrl:dbGatewayUrl,
  internalServiceToken:internalToken,
  tenantId,
  workerId,
  environment,
});

const controlPlane=new ControlPlaneClient({
  baseUrl:controlPlaneUrl,
  internalServiceToken:internalToken,
});

const dispatcher=new LocalControlPlaneDispatcher({
  baseUrl:localControlPlaneUrl,
  pollIntervalMs:Number(process.env.LOCAL_TASK_POLL_MS ?? "1000"),
  timeoutMs:Number(process.env.LOCAL_TASK_TIMEOUT_MS ?? "120000"),
});

let running=false;
let stopping=false;
let lastTick:{at:string;status:string;code?:string;workId?:string}={
  at:new Date().toISOString(),
  status:"BOOTING",
};

async function tick():Promise<void> {
  if(running || stopping) return;
  running=true;
  try {
    const result=await processNextWork({
      queue,
      controlPlane,
      bootstrapSigningKey:signingKey,
      gatewayUrl:dbGatewayUrl,
      internalServiceToken:internalToken,
      workerId,
      handler:async(work)=>dispatcher.dispatch(work),
    });
    lastTick={
      at:new Date().toISOString(),
      status:result.status,
      code:result.code,
      workId:result.workId,
    };
  } catch(error) {
    lastTick={
      at:new Date().toISOString(),
      status:"FAILED",
      code:error instanceof Error ? (error.message.split(":")[0] ?? "UNKNOWN_FAILURE") : "UNKNOWN_FAILURE",
    };
  } finally {
    running=false;
  }
}

const intervalMs=Number(process.env.X1_WORKER_POLL_MS ?? "5000");
if(!Number.isInteger(intervalMs) || intervalMs<1000 || intervalMs>60000) throw new Error("X1_WORKER_POLL_MS_INVALID");

const timer=setInterval(()=>void tick(),intervalMs);
void tick();

const server=createServer((req,res)=>{
  if(req.url==="/healthz") {
    const healthy=lastTick.status!=="FAILED";
    res.statusCode=healthy?200:503;
    res.setHeader("content-type","application/json");
    res.end(JSON.stringify({
      ok:healthy,
      workerId,
      runtime:environment,
      executionPlane:"jarvis-local",
      lastTick,
    }));
    return;
  }
  res.statusCode=404;
  res.setHeader("content-type","application/json");
  res.end(JSON.stringify({ok:false,code:"NOT_FOUND"}));
});

server.listen(port,"0.0.0.0");

function shutdown():void {
  if(stopping) return;
  stopping=true;
  clearInterval(timer);
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(1),5000);
}

process.on("SIGTERM",shutdown);
process.on("SIGINT",shutdown);