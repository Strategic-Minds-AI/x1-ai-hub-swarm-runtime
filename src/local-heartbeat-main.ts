/// <reference lib="dom" />
declare const process: {
  env: Record<string,string|undefined>;
  exit(code?:number): never;
  on(event:"SIGTERM"|"SIGINT", handler:()=>void): void;
};

import { createServer } from "node:http";
import { SupabaseWorkQueue } from "./work-queue-client.js";
import { buildWorkerIdentity } from "./worker-identity.js";

function required(name:string):string {
  const value=process.env[name];
  if(!value) throw new Error(`CONFIG_REQUIRED:${name}`);
  return value;
}

const workerId=process.env.X1_WORKER_ID ?? "jarvis-local-power-grid-1";
const tenantId=required("X1_SYSTEM_TENANT_ID");
const environment=(process.env.X1_RUNTIME_ENV ?? "preview") as "development"|"preview"|"production";
if(environment!=="preview") throw new Error("LOCAL_HEARTBEAT_PREVIEW_ONLY");

const identity=buildWorkerIdentity({
  workerId,
  tenantId,
  executionPlane:"jarvis-local",
  environment,
  identityVersion:required("X1_WORKER_IDENTITY_VERSION"),
  artifactDigest:required("X1_WORKER_ARTIFACT_DIGEST"),
  credentialId:required("X1_WORKER_CREDENTIAL_ID"),
  allowedActionClasses:["READ_ONLY"],
  allowedCapabilities:["local-agent-request","local-control-plane-dispatch"],
});

const queue=new SupabaseWorkQueue({
  gatewayUrl:required("X1_DB_GATEWAY_URL"),
  internalServiceToken:required("X1_INTERNAL_SERVICE_TOKEN"),
  tenantId,
  workerId,
  environment,
  requireRegisteredIdentity:false,
  workerIdentity:identity,
});

const intervalMs=Number(process.env.X1_HEARTBEAT_MS ?? "30000");
if(!Number.isInteger(intervalMs) || intervalMs<10000 || intervalMs>300000) throw new Error("X1_HEARTBEAT_MS_INVALID");

let stopping=false;
let last={at:new Date().toISOString(),status:"BOOTING",code:null as string|null};

async function heartbeat():Promise<void> {
  if(stopping) return;
  try {
    await queue.recordHeartbeat("ONLINE",{
      runtime:"docker",
      purpose:"screen-off-local-presence",
      lease_request:false,
    });
    last={at:new Date().toISOString(),status:"PASS",code:null};
  } catch(error) {
    last={
      at:new Date().toISOString(),
      status:"FAIL",
      code:error instanceof Error ? error.message.split(":")[0] ?? "UNKNOWN" : "UNKNOWN",
    };
  }
}

const timer=setInterval(()=>void heartbeat(),intervalMs);
void heartbeat();

const port=Number(process.env.PORT ?? "4313");
const server=createServer((req,res)=>{
  if(req.url==="/healthz"){
    const ok=last.status!=="FAIL";
    res.statusCode=ok?200:503;
    res.setHeader("content-type","application/json");
    res.end(JSON.stringify({ok,workerId,runtime:environment,last}));
    return;
  }
  res.statusCode=404;
  res.end();
});
server.listen(port,"0.0.0.0");

function shutdown():void {
  if(stopping) return;
  stopping=true;
  clearInterval(timer);
  void queue.recordHeartbeat("OFFLINE",{reason:"graceful_shutdown"}).finally(()=>{
    server.close(()=>process.exit(0));
    setTimeout(()=>process.exit(1),3000);
  });
}
process.on("SIGTERM",shutdown);
process.on("SIGINT",shutdown);
