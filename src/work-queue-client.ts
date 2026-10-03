import type { LeasedWork } from "./types.js";
import type { HttpFetchLike } from "./supabase-execution-ledger.js";

export interface SupabaseWorkQueueConfig {
  url?: string;
  serviceRoleKey?: string;
  gatewayUrl?: string;
  internalServiceToken?: string;
  tenantId: string;
  workerId: string;
  environment: "development" | "preview" | "production";
  agentLane?: string;
  leaseTtlSeconds?: number;
  fetchImpl?: HttpFetchLike;
}

function resolveFetch(config: SupabaseWorkQueueConfig): HttpFetchLike {
  const runtimeFetch=(globalThis as unknown as {fetch?:HttpFetchLike}).fetch;
  const fetchImpl=config.fetchImpl ?? runtimeFetch;
  if(!fetchImpl) throw new Error("SUPABASE_FETCH_UNAVAILABLE");
  return fetchImpl;
}

function validateConfig(config: SupabaseWorkQueueConfig): void {
  const direct=Boolean(config.url && config.serviceRoleKey);
  const gateway=Boolean(config.gatewayUrl && config.internalServiceToken);
  if(!direct && !gateway) throw new Error("WORK_QUEUE_TRANSPORT_REQUIRED");
  if(!config.tenantId || !config.workerId) throw new Error("WORK_QUEUE_CONTEXT_REQUIRED");
  const ttl=config.leaseTtlSeconds ?? 300;
  if(!Number.isInteger(ttl) || ttl<30 || ttl>600) throw new Error("WORK_QUEUE_LEASE_TTL_INVALID");
}

export class SupabaseWorkQueue {
  constructor(private readonly config: SupabaseWorkQueueConfig) {
    validateConfig(config);
  }

  private async rpc(name:string,body:Record<string,unknown>): Promise<unknown> {
    const fetchImpl=resolveFetch(this.config);
    if(this.config.gatewayUrl && this.config.internalServiceToken) {
      const response=await fetchImpl(this.config.gatewayUrl,{
        method:"POST",
        headers:{
          Authorization:`Bearer ${this.config.internalServiceToken}`,
          "Content-Type":"application/json",
          Accept:"application/json",
        },
        body:JSON.stringify({op:"rpc",name,body}),
      });
      const text=await response.text();
      let parsed:any={};
      try { parsed=text ? JSON.parse(text) : {}; } catch {}
      if(!response.ok || parsed?.ok!==true) {
        throw new Error(`WORK_QUEUE_GATEWAY_FAILED:${response.status}:${parsed?.code ?? "UNKNOWN"}`);
      }
      return parsed.data ?? null;
    }

    const response=await fetchImpl(
      `${this.config.url!.replace(/\/$/,"")}/rest/v1/rpc/${name}`,
      {
        method:"POST",
        headers:{
          apikey:this.config.serviceRoleKey!,
          Authorization:`Bearer ${this.config.serviceRoleKey}`,
          "Content-Type":"application/json",
          Accept:"application/json",
        },
        body:JSON.stringify(body),
      },
    );
    const text=await response.text();
    if(!response.ok) {
      let code="UNKNOWN";
      try { code=(text ? JSON.parse(text) as {code?:string} : {}).code ?? code; } catch {}
      throw new Error(`WORK_QUEUE_RPC_FAILED:${response.status}:${code}`);
    }
    return text ? JSON.parse(text) : null;
  }

  async leaseNextWork(): Promise<LeasedWork | null> {
    const rpcName=this.config.agentLane ? "x1_lease_next_work_for_lane" : "x1_lease_next_work";
    const body:Record<string,unknown>={
      p_tenant_id:this.config.tenantId,
      p_worker_id:this.config.workerId,
      p_environment:this.config.environment,
      p_ttl_seconds:this.config.leaseTtlSeconds ?? 300,
    };
    if(this.config.agentLane) body.p_agent_lane=this.config.agentLane;
    const result=await this.rpc(rpcName,body);
    if(result===null) return null;
    return result as LeasedWork;
  }

  async finishWork(
    work:LeasedWork,
    status:"COMPLETED"|"FAILED"|"BLOCKED",
    errorCode?:string,
  ): Promise<void> {
    await this.rpc("x1_finish_work",{
      p_work_id:work.work_id,
      p_lease_id:work.lease.leaseId,
      p_status:status,
      p_error_code:errorCode ?? null,
    });
  }
}
