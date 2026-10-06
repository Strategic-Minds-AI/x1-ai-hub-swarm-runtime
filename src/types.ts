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

export interface CapabilityRequirement {
  id: string;
  mechanism: "skill" | "tool" | "connector" | "model" | "modality" | "plugin" | "mcp" | "api" | "policy";
  description?: string;
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

export interface LeasedWork {
  work_id: string;
  mission_id?: string | null;
  work_packet_id: string;
  task_id: string;
  tenant_id: string;
  requested_by: string;
  action_class: "READ_ONLY" | "NON_PRODUCTION_MUTATION" | "PROTECTED_MUTATION" | "PRODUCTION_RELEASE";
  required_capabilities: CapabilityRequirement[];
  payload: Record<string, unknown>;
  source_sha?: string | null;
  idempotency_key: string;
  approval_reference?: string | null;
  validation_receipt_id?: string | null;
  rollback_reference?: string | null;
  attempt: number;
  lease: TaskLease;
}
