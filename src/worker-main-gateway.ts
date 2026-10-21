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
import type { LeasedWork } from "./types.js";
import { createPreviewHandler, PREVIEW_ACTION_CLASS, type PreviewRuntimeContext, type PreviewWork } from "./preview-pipeline.js";
import { createGatewayReceiptReader } from "./receipt-readback.js";

function required(name:string):string {
  const value=process.env[name];
  if(!value) throw new Error(`CONFIG_REQUIRED:${name}`);
  return value;
}

const port=Number(process.env.PORT ?? "3000");
if(!Number.isInteger(port) || port<=0 || port>65535) throw new Error("PORT_INVALID");

const workerId=process.env.X1_WORKER_ID ?? "x1-swarm-preview-1";
const environment=(process.env.X1_RUNTIME_ENV ?? "preview") as "development"|"preview"|"production";
if(!["development","preview","production"].includes(environment)) throw new Error("X1_RUNTIME_ENV_INVALID");
const sourceSha=process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.X1_SOURCE_SHA ?? null;

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
});

const controlPlane=new ControlPlaneClient({
  baseUrl:controlPlaneUrl,
  internalServiceToken:internalToken,
});

// Preview dispatch. Fail-closed by default: the feature flag, the deploy authorization
// and the preview host allowlist are all off unless the environment says otherwise.
const previewContext:PreviewRuntimeContext={
  runtime_env:environment,
  system_tenant_id:tenantId,
  preview_enabled:process.env.X1_PREVIEW_ENABLED==="true",
  staging_supabase_ref:process.env.X1_STAGING_SUPABASE_REF ?? "",
  production_supabase_ref:process.env.X1_PRODUCTION_SUPABASE_REF ?? "",
  source_sha:sourceSha,
};

const previewHostAllowlist=(process.env.X1_PREVIEW_HOST_ALLOWLIST ?? "")
  .split(",")
  .map((entry)=>entry.trim().toLowerCase())
  .filter((entry)=>entry.length>0);

const receipts=createGatewayReceiptReader({
  gatewayUrl:dbGatewayUrl,
  internalServiceToken:internalToken,
});

async function probePreviewUrl(url:string):Promise<{reachable:boolean;http_status:number;checked_at:string}> {
  const checkedAt=new Date().toISOString();
  if(url.indexOf("https://")!==0) return {reachable:false,http_status:0,checked_at:checkedAt};
  try {
    const response=await fetch(url,{method:"HEAD"});
    return {reachable:response.status===200,http_status:response.status,checked_at:checkedAt};
  } catch {
    return {reachable:false,http_status:0,checked_at:checkedAt};
  }
}

const previewHandler=createPreviewHandler({
  context:previewContext,
  workerIdentity:workerId,
  receipts,
  deployAuthorized:process.env.X1_PREVIEW_DEPLOY_AUTHORIZED==="true",
  previewHostAllowlist,
  probePreviewUrl,
});

async function dispatchWork(work:LeasedWork):Promise<unknown> {
  if(work.action_class==="READ_ONLY") {
    return {
      acknowledged:true,
      missionId:work.mission_id ?? null,
      workPacketId:work.work_packet_id,
      taskId:work.task_id,
      sourceSha,
    };
  }
  if(work.action_class===PREVIEW_ACTION_CLASS) {
    const result=await previewHandler(work as unknown as PreviewWork);
    if(!result.ok) throw new Error(result.code+": "+result.reason);
    return {
      acknowledged:true,
      workPacketId:work.work_packet_id,
      taskId:work.task_id,
      sourceSha,
      actionClass:work.action_class,
      code:result.code,
      preview:result.artifact ?? null,
    };
  }
  throw new Error("NO_HANDLER_FOR_ACTION_CLASS:"+String(work.action_class));
}

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
      handler:async(work)=>dispatchWork(work),
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
    res.end(JSON.stringify({ok:healthy,workerId,runtime:environment,sourceSha,lastTick}));
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
