import type { BootstrapAuthorization, CapabilityRequirement } from "./types.js";
import type { HttpFetchLike } from "./supabase-execution-ledger.js";

export interface ControlPlaneClientConfig {
  baseUrl: string;
  internalServiceToken: string;
  fetchImpl?: HttpFetchLike;
}

export interface AuthorizationRequest {
  taskId: string;
  agentId: string;
  tenantId: string;
  requestedAction: string;
  requiredCapabilities: CapabilityRequirement[];
}

interface AuthorizationResponse {
  authorization?: BootstrapAuthorization;
  code?: string;
}

function resolveFetch(config: ControlPlaneClientConfig): HttpFetchLike {
  const runtimeFetch=(globalThis as unknown as {fetch?:HttpFetchLike}).fetch;
  const fetchImpl=config.fetchImpl ?? runtimeFetch;
  if(!fetchImpl) throw new Error("CONTROL_PLANE_FETCH_UNAVAILABLE");
  return fetchImpl;
}

function validateConfig(config: ControlPlaneClientConfig): void {
  if(!config.baseUrl) throw new Error("CONTROL_PLANE_URL_REQUIRED");
  if(!config.internalServiceToken) throw new Error("CONTROL_PLANE_INTERNAL_TOKEN_REQUIRED");
}

export class ControlPlaneClient {
  constructor(private readonly config: ControlPlaneClientConfig) {
    validateConfig(config);
  }

  async requestMandatoryAuthorization(input: AuthorizationRequest): Promise<BootstrapAuthorization> {
    const response=await resolveFetch(this.config)(
      `${this.config.baseUrl.replace(/\/$/,"")}/api/authorize`,
      {
        method:"POST",
        headers:{
          Authorization:`Bearer ${this.config.internalServiceToken}`,
          "Content-Type":"application/json",
          Accept:"application/json",
        },
        body:JSON.stringify(input),
      },
    );
    const text=await response.text();
    let body:AuthorizationResponse={};
    try { body=text ? JSON.parse(text) as AuthorizationResponse : {}; } catch {}

    if((response.ok || response.status===403) && body.authorization) {
      return body.authorization;
    }
    throw new Error(`CONTROL_PLANE_AUTHORIZATION_FAILED:${response.status}:${body.code ?? "UNKNOWN"}`);
  }
}
