import type { LeasedWork } from "./types.js";
import type { HttpFetchLike } from "./supabase-execution-ledger.js";
import type { RegisteredWorkerIdentity } from "./worker-identity.js";
import { workerIdentityAssertionBody } from "./worker-identity.js";

export interface SupabaseWorkQueueConfig {
  url?: string;
  serviceRoleKey?: string;
  gatewayUrl?: string;
  internalServiceToken?: string;
  tenantId: string;
  workerId: string;
  environment: "development" | "preview" | "production";
  leaseTtlSeconds?: number;
  fetchImpl?: HttpFetchLike;
  requireRegisteredIdentity?: boolean;
  workerIdentity?: RegisteredWorkerIdentity;
}

export interface X1IncidentRecord {
  incident_key: string;
  tenant_id: string;
  severity: "P0"|"P1"|"P2"|"P3"|"P4"|"P5"|"P6"|"P7";
  category: string;
  status: "OPEN"|"MITIGATED"|"RESOLVED"|"BLOCKED";
  source_system?: string;
  related_work_id?: string | null;
  failure_fingerprint?: string | null;
  summary: string;
  evidence?: unknown[];
  workaround?: Record<string,unknown>;
  next_action?: string | null;
  attempts?: number;
  resolved_at?: string | null;
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

  if(config.requireRegisteredIdentity) {
    const identity=config.workerIdentity;
    if(!identity) throw new Error("WORKER_IDENTITY_REQUIRED");
    if(identity.workerId!==config.workerId) throw new Error("WORKER_IDENTITY_WORKER_CONTEXT_MISMATCH");
    if(identity.tenantId!==config.tenantId) throw new Error("WORKER_IDENTITY_TENANT_CONTEXT_MISMATCH");
    if(identity.environment!==config.environment) throw new Error("WORKER_IDENTITY_ENVIRONMENT_CONTEXT_MISMATCH");
  }
}

export class SupabaseWorkQueue {
  constructor(private readonly config: SupabaseWorkQueueConfig) {
    validateConfig(config);
  }

  private async gatewayOperation(op:string,body:Record<string,unknown>):Promise<unknown> {
    if(!this.config.gatewayUrl || !this.config.internalServiceToken) {
      throw new Error("WORK_QUEUE_GATEWAY_REQUIRED");
    }
    const fetchImpl=resolveFetch(this.config);
    const response=await fetchImpl(this.config.gatewayUrl,{
      method:"POST",
      headers:{
        Authorization:`Bearer ${this.config.internalServiceToken}`,
        "Content-Type":"application/json",
        Accept:"application/json",
      },
      body:JSON.stringify({op,...body}),
    });
    const text=await response.text();
    let parsed:any={};
    try { parsed=text ? JSON.parse(text) : {}; } catch {}
    if(!response.ok || parsed?.ok!==true) {
      throw new Error(`WORK_QUEUE_GATEWAY_FAILED:${response.status}:${parsed?.code ?? "UNKNOWN"}`);
    }
    return parsed.data ?? null;
  }

  private async rpc(name:string,body:Record<string,unknown>): Promise<unknown> {
    const fetchImpl=resolveFetch(this.config);
    if(this.config.gatewayUrl && this.config.internalServiceToken) {
      return this.gatewayOperation("rpc",{name,body});
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

  private async assertRegisteredIdentity():Promise<void> {
    if(!this.config.requireRegisteredIdentity) return;
    const identity=this.config.workerIdentity;
    if(!identity) throw new Error("WORKER_IDENTITY_REQUIRED");
    const result=await this.rpc("x1_assert_worker_identity",workerIdentityAssertionBody(identity));
    if(!result || typeof result!=="object" || (result as {ok?:boolean}).ok!==true) {
      throw new Error("WORKER_IDENTITY_ASSERTION_REJECTED");
    }
  }

  async recordHeartbeat(
    runtimeState:"ONLINE"|"DEGRADED"|"STALE"|"OFFLINE"|"BOOTING",
    health:Record<string,unknown>={},
  ):Promise<unknown> {
    const identity=this.config.workerIdentity;
    if(!identity) throw new Error("WORKER_IDENTITY_REQUIRED");
    return this.rpc("x1_record_worker_heartbeat",{
      p_worker_id:identity.workerId,
      p_tenant_id:identity.tenantId,
      p_environment:identity.environment,
      p_execution_plane:identity.executionPlane,
      p_identity_fingerprint:identity.identityFingerprint,
      p_artifact_digest:identity.artifactDigest,
      p_runtime_state:runtimeState,
      p_health:health,
    });
  }

  async persistIncident(record:X1IncidentRecord):Promise<unknown> {
    const row={
      ...record,
      source_system:record.source_system ?? this.config.workerId,
      attempts:record.attempts ?? 0,
      evidence:record.evidence ?? [],
      workaround:record.workaround ?? {},
    };
    return this.gatewayOperation("persist_incident",{row});
  }

  async leaseNextWork(): Promise<LeasedWork | null> {
    await this.assertRegisteredIdentity();
    const result=await this.rpc("x1_lease_next_work",{
      p_tenant_id:this.config.tenantId,
      p_worker_id:this.config.workerId,
      p_environment:this.config.environment,
      p_ttl_seconds:this.config.leaseTtlSeconds ?? 300,
    });
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
