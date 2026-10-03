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
import { parseSuperAgentLane } from "./super-agent-lanes.js";

function required(name:string):string {
  const value=process.env[name];
  if(!value) throw new Error(`CONFIG_REQUIRED:${name}`);
  return value;
}

const port=Number(process.env.PORT ?? "3000");
if(!Number.isInteger(port) || port<=0 || port>65535) throw new Error("PORT_INVALID");

const environment=(process.env.X1_RUNTIME_ENV ?? "preview") as "development"|"preview"|"production";
const rawAgentLane=process.env.X1_AGENT_LANE;
const agentLane=rawAgentLane ? parseSuperAgentLane(rawAgentLane) : undefined;
if(rawAgentLane && !agentLane) throw new Error("X1_AGENT_LANE_INVALID");
const workerId=process.env.X1_WORKER_ID ?? (agentLane ? `super-agent-${agentLane}-${environment}` : "x1-swarm-preview-1");
if(!["development","preview","production"].includes(environment)) throw new Error("X1_RUNTIME_ENV_INVALID");

const tenantId=required("X1_SYSTEM_TENANT_ID");
const controlPlaneUrl=required("X1_CONTROL_PLANE_URL");
const dbGatewayUrl=required("X1_DB_GATEWAY_URL");
const internalToken=required("X1_INTERNAL_SERVICE_TOKEN");
const signingKey=createHash("sha256")
  .update(`project-zero-bootstrap-signing-v1:${internalToken}`)
  .digest("hex");

const queue=new SupabaseWorkQueue({
  gatewayUrl:dbGatewayUrl,
  internalServiceToken:internalToken,
  tenantId,
  workerId,
  environment,
  agentLane,
});

const controlPlane=new ControlPlaneClient({
  baseUrl:controlPlaneUrl,
  internalServiceToken:internalToken,
});

let running=false;
let stopping=false;
let lastTick:{at:string;status:string;code?:string}={at:new Date().toISOString(),status:"BOOTING"};

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
      handler:async(work)=>{
        if(work.action_class!=="READ_ONLY") throw new Error("NO_PREVIEW_HANDLER_FOR_MUTATION");
        return {acknowledged:true,workPacketId:work.work_packet_id,taskId:work.task_id,agentLane:agentLane ?? null};
      },
    });
    lastTick={at:new Date().toISOString(),status:result.status,code:result.code};
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
    res.end(JSON.stringify({ok:healthy,workerId,runtime:environment,agentLane:agentLane ?? null,lastTick}));
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
