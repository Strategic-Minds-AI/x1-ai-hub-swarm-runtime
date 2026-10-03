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
    if(work.action_class!=="READ_ONLY") throw new Error("LOCAL_BRIDGE_READ_ONLY_REQUIRED");
    const target=cleanString(work.payload?.execution_target,"");
    if(target!=="jarvis-local") throw new Error("LOCAL_BRIDGE_TARGET_MISMATCH");

    const agentName=cleanString(work.payload?.local_agent,"orchestrator");
    if(!ALLOWED_AGENTS.has(agentName)) throw new Error("LOCAL_BRIDGE_AGENT_NOT_ALLOWED");
    const taskType=cleanString(work.payload?.local_task_type,"agent_request");

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
      const status=cleanString(current?.status,"unknown");
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
