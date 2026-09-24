export interface BootstrapBlocker {
  capabilityId: string;
  state: string;
  closure: string;
  detail: string;
}

export interface BootstrapAuthorization {
  authorization_id: string;
  task_id: string;
  agent_id: string;
  tenant_id: string;
  requested_action: string;
  capabilities_required: string[];
  capabilities_resolved: string[];
  capability_sources: Record<string, string>;
  policy_version: string;
  registry_version: string;
  issued_at: string;
  expires_at: string;
  allowed: boolean;
  blockers: BootstrapBlocker[];
  receipt_id: string;
  signature: {
    algorithm: "HMAC-SHA256";
    value: string;
  };
}

export interface ExecutionContext {
  taskId: string;
  agentId: string;
  tenantId: string;
}

export interface TaskLease {
  leaseId: string;
  taskId: string;
  holderAgentId: string;
  acquiredAt: string;
  expiresAt: string;
}
