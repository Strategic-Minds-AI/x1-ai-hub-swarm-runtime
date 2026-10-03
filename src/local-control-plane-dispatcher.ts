import type { HttpFetchLike } from "./supabase-execution-ledger.js";
import type { LeasedWork } from "./types.js";

export interface LocalControlPlaneDispatcherConfig {
  baseUrl: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: HttpFetchLike;
}

const ALLOWED_AGENTS = new Set([
  "orchestrator",
  "growth_operator",
  "code_architect",
  "social_strategist",
  "sales_engine",
  "brand_guardian",
  "replicator",
  "swarm",
  "staging",
  "validator",
]);

const ALLOWED_TASK_TYPES = new Set(["agent_request"]);
const ALLOWED_ENVIRONMENTS = new Set(["staging", "preview"]);
const ALLOWED_STATUSES = new Set(["pending", "in_progress", "completed", "failed", "needs_approval"]);
const MAX_PACKET_BYTES = 64 * 1024;
const MAX_TEXT_FIELD = 512;
const SENSITIVE_KEY_PATTERN = /(token|secret|password|api[_-]?key|authorization|cookie|private[_-]?key|service[_-]?role)/i;

function resolveFetch(config: LocalControlPlaneDispatcherConfig): HttpFetchLike {
  const runtimeFetch=(globalThis as unknown as {fetch?:HttpFetchLike}).fetch;
  const fetchImpl=config.fetchImpl ?? runtimeFetch;
  if(!fetchImpl) throw new Error("LOCAL_CONTROL_PLANE_FETCH_UNAVAILABLE");
  return fetchImpl;
}

function cleanString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function sleep(ms:number):Promise<void> {
  return new Promise(resolve=>setTimeout(resolve,ms));
}

function assertText(value:unknown,label:string,max=MAX_TEXT_FIELD):string {
  const cleaned=cleanString(value,"");
  if(!cleaned || cleaned.length>max) throw new Error(`LOCAL_BRIDGE_${label}_INVALID`);
  return cleaned;
}

function validatePayloadKeys(value:unknown,depth=0):void {
  if(depth>8) throw new Error("LOCAL_BRIDGE_PAYLOAD_DEPTH_EXCEEDED");
  if(Array.isArray(value)) {
    for(const item of value) validatePayloadKeys(item,depth+1);
    return;
  }
  if(!value || typeof value!=="object") return;
  for(const [key,child] of Object.entries(value as Record<string,unknown>)) {
    if(SENSITIVE_KEY_PATTERN.test(key)) throw new Error("LOCAL_BRIDGE_SENSITIVE_PAYLOAD_KEY");
    validatePayloadKeys(child,depth+1);
  }
}

function validateWorkEnvelope(work:LeasedWork):{agentName:string;taskType:string} {
  if(work.action_class!=="READ_ONLY") throw new Error("LOCAL_BRIDGE_READ_ONLY_REQUIRED");
  if(assertText(work.payload?.execution_target,"TARGET")!=="jarvis-local") {
    throw new Error("LOCAL_BRIDGE_TARGET_MISMATCH");
  }
  const environment=cleanString(work.payload?.environment,"preview");
  if(!ALLOWED_ENVIRONMENTS.has(environment)) throw new Error("LOCAL_BRIDGE_ENVIRONMENT_BLOCKED");
  if(!/^[0-9a-f]{64}$/.test(work.idempotency_key)) throw new Error("LOCAL_BRIDGE_IDEMPOTENCY_INVALID");
  assertText(work.work_packet_id,"WORK_PACKET_ID");
  assertText(work.task_id,"TASK_ID");
  assertText(work.requested_by,"REQUESTED_BY");
  const payloadJson=JSON.stringify(work.payload ?? {});
  if(new TextEncoder().encode(payloadJson).byteLength>MAX_PACKET_BYTES) {
    throw new Error("LOCAL_BRIDGE_PAYLOAD_TOO_LARGE");
  }
  validatePayloadKeys(work.payload);
  const agentName=assertText(work.payload?.local_agent ?? "orchestrator","AGENT");
  if(!ALLOWED_AGENTS.has(agentName)) throw new Error("LOCAL_BRIDGE_AGENT_NOT_ALLOWED");
  const taskType=assertText(work.payload?.local_task_type ?? "agent_request","TASK_TYPE");
  if(!ALLOWED_TASK_TYPES.has(taskType)) throw new Error("LOCAL_BRIDGE_TASK_TYPE_NOT_ALLOWED");
  return {agentName,taskType};
}

export class LocalControlPlaneDispatcher {
  private readonly baseUrl:string;
  private readonly pollIntervalMs:number;
  private readonly timeoutMs:number;

  constructor(private readonly config:LocalControlPlaneDispatcherConfig) {
    this.baseUrl=cleanString(config.baseUrl,"").replace(/\/$/,"");
    if(!this.baseUrl) throw new Error("LOCAL_CONTROL_PLANE_URL_REQUIRED");
    this.pollIntervalMs=config.pollIntervalMs ?? 1000;
    this.timeoutMs=config.timeoutMs ?? 120000;
    if(!Number.isInteger(this.pollIntervalMs) || this.pollIntervalMs<100 || this.pollIntervalMs>10000) {
      throw new Error("LOCAL_CONTROL_PLANE_POLL_INVALID");
    }
    if(!Number.isInteger(this.timeoutMs) || this.timeoutMs<1000 || this.timeoutMs>600000) {
      throw new Error("LOCAL_CONTROL_PLANE_TIMEOUT_INVALID");
    }
  }

  private async post(path:string,body:Record<string,unknown>):Promise<any> {
    const response=await resolveFetch(this.config)(this.baseUrl+path,{
      method:"POST",
      headers:{"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify(body),
    });
    const text=await response.text();
    let parsed:any={};
    try { parsed=text ? JSON.parse(text) : {}; } catch {}
    if(!response.ok) {
      throw new Error(`LOCAL_CONTROL_PLANE_FAILED:${response.status}:${parsed?.error ?? "UNKNOWN"}`);
    }
    return parsed;
  }

  async dispatch(work:LeasedWork):Promise<Record<string,unknown>> {
    const {agentName,taskType}=validateWorkEnvelope(work);

    const created=await this.post("/api/entities/AgentTask/create",{
      data:{
        agent_name:agentName,
        task_type:taskType,
        title:`Power Grid ${work.work_packet_id}`,
        description:JSON.stringify({
          source:"x1_work_queue",
          work_id:work.work_id,
          work_packet_id:work.work_packet_id,
          task_id:work.task_id,
          requested_by:work.requested_by,
          source_sha:work.source_sha ?? null,
          idempotency_key:work.idempotency_key,
          x1_payload:work.payload,
        }),
        status:"pending",
        priority:"high",
        autonomous:true,
      },
    });

    if(!created?.id) throw new Error("LOCAL_BRIDGE_TASK_ID_MISSING");
    const started=Date.now();

    while(Date.now()-started<=this.timeoutMs) {
      const current=await this.post("/api/entities/AgentTask/get",{id:created.id});
      if(current?.id!==created.id) throw new Error("LOCAL_BRIDGE_TASK_ID_MISMATCH");
      const status=cleanString(current?.status,"");
      if(!ALLOWED_STATUSES.has(status)) throw new Error("LOCAL_BRIDGE_TASK_STATUS_INVALID");
      if(status==="completed") {
        return {
          localTaskId:created.id,
          status,
          agentName,
          taskType,
          result:current?.result ?? null,
        };
      }
      if(status==="failed") throw new Error("LOCAL_BRIDGE_TASK_FAILED");
      if(status==="needs_approval") throw new Error("LOCAL_BRIDGE_TASK_NEEDS_APPROVAL");
      await sleep(this.pollIntervalMs);
    }

    throw new Error("LOCAL_BRIDGE_TASK_TIMEOUT");
  }
}