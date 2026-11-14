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
import { SingleFlightGate } from "./single-flight.js";
import {X1_PROMPT_PREVIEW_KIND,createX1PreviewHttpProvider,executeX1PromptPreview} from "./x1-prompt-preview.js";
import {assertIndependentQaConfig,requireIndependentQaProof} from "./x1-preview-qa-handoff.js";
import {assertWleSignedAuthorizationScope,handleWleSyntheticPreview,WLE_PREVIEW_KIND}
  from "./wle-preview-adapter.js";
import {assertWlePrivateQaConfig,requireWlePrivateQaProof}
  from "./wle-private-qa-handoff.js";

function required(name:string):string {
  const value=process.env[name];
  if(!value) throw new Error(`CONFIG_REQUIRED:${name}`);
  return value;
}

const port=Number(process.env.PORT ?? "3000");
if(!Number.isInteger(port) || port<=0 || port>65535) throw new Error("PORT_INVALID");

// A missing runtime identity must never silently connect to Preview.
const workerId=required("X1_WORKER_ID");
const environment=required("X1_RUNTIME_ENV") as "development"|"preview"|"production";
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

let running=false;
let stopping=false;
const singleFlight=new SingleFlightGate();
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
      authorizationGuard:assertWleSignedAuthorizationScope,
      handler:async(work)=>{
        if(work.action_class==="READ_ONLY")return {
          acknowledged:true,
          missionId:work.mission_id ?? null,
          workPacketId:work.work_packet_id,
          taskId:work.task_id,
          sourceSha,
        };
        // WLE-specific private synthetic preview, on the SAME authorized
        // singleton worker, using X1's signed capability and completion fence.
        // This is OFF unless separately approved on existing preview runtime.
        if(work.action_class==="PREVIEW_WRITE" &&
           work.payload?.kind===WLE_PREVIEW_KIND){
          if(environment!=="preview" ||
             process.env.WLE_PREVIEW_ADAPTER_ENABLED!=="true" ||
             process.env.X1_DB_COMPLETION_FENCING_PASS!=="true" ||
             process.env.WLE_PRIVATE_QA_FENCE_VERIFIED!=="true"){
            throw new Error("WLE_PREVIEW_ADAPTER_DISABLED_OR_FENCING_UNVERIFIED");
          }
          // Validate a DIFFERENT independent validator identity and the
          // existing validator's staging contract BEFORE any storage write.
          // Private storage hash readback by this worker is not a QA PASS.
          const wleQaConfig={
            enabled:process.env.WLE_PRIVATE_QA_ENABLED==="true",
            endpoint:required("WLE_PRIVATE_QA_ENDPOINT"),
            bearerToken:required("WLE_PRIVATE_QA_TOKEN"),
            validatorId:required("WLE_PRIVATE_QA_VALIDATOR_ID"),
            workerId,
          };
          assertWlePrivateQaConfig(wleQaConfig,work);
          const artifact=await handleWleSyntheticPreview(work,{
            environment,systemTenantId:tenantId,workerId,
            supabaseUrl:required("SUPABASE_URL"),
            serviceRoleKey:required("SUPABASE_SERVICE_ROLE_KEY")
          });
          const qa=await requireWlePrivateQaProof(work,artifact,wleQaConfig);
          return {kind:artifact.kind,artifact,independent_qa:"PASS",
            qaReceiptId:qa.receipt_id,validatorId:qa.validator_id,
            status:"QA_RECORDED_PERSISTENCE_FENCED"};
        }
        // Preserve the separately developed generic prompt-preview handler.
        // It retains its own independent QA/provider gates and credentials.
        if(work.action_class==="PREVIEW_WRITE" &&
           work.payload?.kind===X1_PROMPT_PREVIEW_KIND){
          if(environment!=="preview" ||
             process.env.X1_PROMPT_PREVIEW_ENABLED!=="true" ||
             process.env.X1_DB_COMPLETION_FENCING_PASS!=="true"){
            throw new Error("X1_PREVIEW_EXECUTION_NOT_ACTIVATED");
          }
          const githubToken=required("X1_GITHUB_PREVIEW_TOKEN");
          const vercelToken=required("X1_VERCEL_PREVIEW_TOKEN");
          const qaConfig={
            enabled:process.env.X1_INDEPENDENT_PREVIEW_QA_ENABLED==="true",
            endpoint:required("X1_PREVIEW_QA_ENDPOINT"),
            bearerToken:required("X1_PREVIEW_QA_TOKEN"),
            validatorId:required("X1_PREVIEW_QA_VALIDATOR_ID"),
            workerId
          };
          // Fail BEFORE any GitHub or Vercel mutation when independent QA
          // cannot be safely dispatched to a different verified identity.
          assertIndependentQaConfig(qaConfig,work);
          const build=await executeX1PromptPreview(work,
             createX1PreviewHttpProvider({githubToken,vercelToken}));
          const qa=await requireIndependentQaProof(work,build,qaConfig);
          return {kind:build.kind,status:"QA_RECORDED_PERSISTENCE_FENCED",
            build,independent_qa:"PASS",qaReceiptId:qa.receipt_id,
            validatorId:qa.validator_id};

        }
        throw new Error("NO_PREVIEW_HANDLER_FOR_MUTATION");
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

const timer=setInterval(()=>void singleFlight.run(tick),intervalMs);
void singleFlight.run(tick);

const server=createServer((req,res)=>{
  // Railway continues using /healthz for process liveness. /readyz separately
  // exposes queue-poll freshness without restarting a working worker on a
  // temporary control-plane outage.
  if(req.url==="/readyz") {
    const ageMs=Date.now()-Date.parse(lastTick.at);
    const recent=Number.isFinite(ageMs) && ageMs>=0 &&
      ageMs<=Math.max(60000,intervalMs*3);
    const ready=!stopping && !singleFlight.busy && recent &&
      (lastTick.status==="IDLE" || lastTick.status==="COMPLETED");
    res.statusCode=ready?200:503;
    res.setHeader("content-type","application/json");
    res.end(JSON.stringify({ok:ready,workerId,runtime:environment,lastTick,
      busy:singleFlight.busy,stopping}));
    return;
  }
  if(req.url==="/healthz") {
    // This endpoint is process liveness, not dependency readiness. Transient
    // queue/authorization outages must not trigger cascading Railway restarts.
    // /readyz separately reports dependency failures and shutdown drain state.
    const healthy=true;
    res.statusCode=200;
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
  void (async()=>{
    const drained=await singleFlight.stopAndDrain(25000);
    if(!drained) {
      console.error(JSON.stringify({event:"WORKER_SHUTDOWN_DRAIN_TIMEOUT",
        workerId,runtime:environment}));
    }
    // Never acknowledge unfinished work on forced shutdown. Its original
    // lease and durable idempotency record remain for independent recovery.
    const hardStop=setTimeout(()=>process.exit(1),3000);
    server.close(()=>{
      clearTimeout(hardStop);
      process.exit(drained?0:1);
    });
  })().catch(()=>process.exit(1));
}

process.on("SIGTERM",shutdown);
process.on("SIGINT",shutdown);
