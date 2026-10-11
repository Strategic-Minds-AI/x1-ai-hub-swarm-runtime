import { createHash } from "node:crypto";

export type SandboxState =
  | "REQUESTED" | "LEASED" | "BUILDING" | "TESTING" | "REPAIRING"
  | "VERIFIED" | "ARCHIVED" | "CLEANED" | "FAILED" | "QUARANTINED";

export type SandboxAction =
  | "WRITE_WORKTREE" | "RUN_TESTS" | "REPLACE_GENERATED_ASSET"
  | "DELETE_OWNED_RESOURCE" | "PREVIEW_BUILD";

export interface SandboxRequest {
  tenantId: string;
  clientSlug: string;
  missionId: string;
  idempotencyKey: string;
  sourceSha: string;
  ttlMinutes: number;
  budgetCents?: number;
  budgetApprovalRef?: string;
}

export interface Workspace {
  id: string;
  tenantId: string;
  clientSlug: string;
  missionId: string;
  idempotencyKey: string;
  sourceSha: string;
  state: SandboxState;
  ownerTag: string;
  resourcePrefix: string;
  createdAt: string;
  expiresAt: string;
  budgetCents: number;
  spentCents: number;
  budgetApprovalRef?: string;
  revision: number;
  lastEventId: string | null;
  archivesVerified: boolean;
}

export interface OwnedResource {
  provider: "github" | "vercel" | "railway" | "supabase-staging" | "google-drive";
  externalId: string;
  ownerTag: string;
  resourceKey: string;
  environment: "sandbox" | "preview" | "production";
}

export class SandboxGuardError extends Error {
  constructor(public readonly code: string) { super(code); this.name = "SandboxGuardError"; }
}

function requireCondition(ok: boolean, code: string): void {
  if (!ok) throw new SandboxGuardError(code);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const SHA = /^[0-9a-f]{40,64}$/i;
const MAX_TTL_MINUTES = 120;
const MAX_BUDGET_CENTS = 50000;

export function prepareWorkspace(input: SandboxRequest, now: Date): Workspace {
  requireCondition(!Number.isNaN(now.getTime()), "INVALID_CLOCK");
  requireCondition(UUID.test(input.tenantId), "TENANT_ID_INVALID");
  requireCondition(SLUG.test(input.clientSlug), "CLIENT_SLUG_INVALID");
  requireCondition(typeof input.missionId === "string" && /^[-_A-Za-z0-9]{6,100}$/.test(input.missionId), "MISSION_ID_INVALID");
  requireCondition(typeof input.idempotencyKey === "string" && input.idempotencyKey.length >= 16 && input.idempotencyKey.length <= 128, "IDEMPOTENCY_KEY_INVALID");
  requireCondition(SHA.test(input.sourceSha), "SOURCE_SHA_REQUIRED");
  requireCondition(Number.isInteger(input.ttlMinutes) && input.ttlMinutes >= 5 && input.ttlMinutes <= MAX_TTL_MINUTES, "TTL_OUT_OF_BOUNDS");
  const cents = input.budgetCents ?? 0;
  requireCondition(Number.isInteger(cents) && cents >= 0 && cents <= MAX_BUDGET_CENTS, "BUDGET_OUT_OF_BOUNDS");
  requireCondition(cents === 0 || Boolean(input.budgetApprovalRef?.trim()), "BUDGET_APPROVAL_REQUIRED");
  const hash = createHash("sha256").update([input.tenantId, input.missionId, input.idempotencyKey].join(":")).digest("hex").slice(0,20);
  const id = "sbx-" + hash;
  return Object.freeze({
    id, tenantId: input.tenantId, clientSlug: input.clientSlug,
    missionId: input.missionId, idempotencyKey: input.idempotencyKey,
    sourceSha: input.sourceSha, state: "REQUESTED" as SandboxState,
    ownerTag: "sandbox:" + id, resourcePrefix: "sandbox/" + id + "/",
    createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + input.ttlMinutes * 60000).toISOString(),
    budgetCents: cents, spentCents: 0, budgetApprovalRef: input.budgetApprovalRef,
    revision: 0, lastEventId: null, archivesVerified: false,
  });
}

export interface SandboxPrincipal {
  tenantId: string;
  verifiedByServer: boolean;
  approvedScope: "sandbox" | "production" | "unknown";
}

export function assertSandboxOperation(
  workspace: Workspace,
  actor: SandboxPrincipal,
  action: SandboxAction,
  resource: OwnedResource,
  now: Date,
  incrementalCostCents = 0,
): void {
  requireCondition(actor.verifiedByServer && actor.approvedScope === "sandbox", "TRUSTED_SANDBOX_PRINCIPAL_REQUIRED");
  requireCondition(actor.tenantId === workspace.tenantId, "CROSS_TENANT_DENIED");
  requireCondition(!Number.isNaN(now.getTime()), "INVALID_CLOCK");
  requireCondition(now.getTime() < Date.parse(workspace.expiresAt), "SANDBOX_EXPIRED");
  requireCondition(["LEASED", "BUILDING", "TESTING", "REPAIRING"].includes(workspace.state), "WORKSPACE_NOT_MUTABLE");
  requireCondition(["WRITE_WORKTREE", "RUN_TESTS", "REPLACE_GENERATED_ASSET", "DELETE_OWNED_RESOURCE", "PREVIEW_BUILD"].includes(action), "ACTION_NOT_SANDBOX_ALLOWLISTED");
  requireCondition(resource.environment === "sandbox" || resource.environment === "preview", "PRODUCTION_MUTATION_BLOCKED");
  requireCondition(resource.ownerTag === workspace.ownerTag, "RESOURCE_OWNERSHIP_MISMATCH");
  requireCondition(resource.resourceKey.startsWith(workspace.resourcePrefix), "RESOURCE_OUTSIDE_SANDBOX");
  requireCondition(resource.externalId.trim().length > 0, "RESOURCE_ID_REQUIRED");
  requireCondition(Number.isInteger(incrementalCostCents) && incrementalCostCents >= 0, "INVALID_COST");
  requireCondition(workspace.spentCents + incrementalCostCents <= workspace.budgetCents, "BUDGET_EXCEEDED");
}

const NEXT: Record<SandboxState, readonly SandboxState[]> = {
  REQUESTED: ["LEASED", "FAILED", "QUARANTINED"],
  LEASED: ["BUILDING", "FAILED", "QUARANTINED"],
  BUILDING: ["TESTING", "REPAIRING", "FAILED", "QUARANTINED"],
  TESTING: ["REPAIRING", "VERIFIED", "FAILED", "QUARANTINED"],
  REPAIRING: ["BUILDING", "TESTING", "FAILED", "QUARANTINED"],
  VERIFIED: ["ARCHIVED", "QUARANTINED"],
  ARCHIVED: ["CLEANED", "QUARANTINED"],
  CLEANED: [],
  FAILED: ["ARCHIVED", "QUARANTINED"],
  QUARANTINED: ["ARCHIVED"],
};

export function advanceWorkspace(
  workspace: Workspace,
  event: {eventId: string; expectedRevision: number; nextState: SandboxState; archivesVerified?: boolean},
): Workspace {
  requireCondition(/^[-_A-Za-z0-9]{8,100}$/.test(event.eventId), "EVENT_ID_INVALID");
  if (workspace.lastEventId === event.eventId) return workspace;
  requireCondition(event.expectedRevision === workspace.revision, "STALE_WORKSPACE_REVISION");
  requireCondition(NEXT[workspace.state]?.includes(event.nextState) === true, "ILLEGAL_STATE_TRANSITION");
  if (event.nextState === "CLEANED") requireCondition(workspace.archivesVerified, "ARCHIVE_RECEIPT_REQUIRED");
  if (event.nextState === "ARCHIVED") requireCondition(event.archivesVerified === true, "ARCHIVE_RECEIPT_REQUIRED");
  return Object.freeze({
    ...workspace, state: event.nextState, revision: workspace.revision + 1,
    archivesVerified: workspace.archivesVerified || event.archivesVerified === true,
    lastEventId: event.eventId,
  });
}

export interface CleanupDecision {
  sandboxId: string;
  action: "NONE" | "QUARANTINE_FOR_EVIDENCE" | "SCHEDULE_OWNED_CLEANUP";
  resources: OwnedResource[];
  reason: string;
}

export function planExpiryCleanup(workspace: Workspace, resources: readonly OwnedResource[], now: Date): CleanupDecision {
  requireCondition(!Number.isNaN(now.getTime()), "INVALID_CLOCK");
  if (workspace.state === "CLEANED" || now.getTime() < Date.parse(workspace.expiresAt)) {
    return {sandboxId: workspace.id, action: "NONE", resources: [], reason: "NOT_DUE_OR_ALREADY_CLEAN"};
  }
  const unowned = resources.some(r => r.ownerTag !== workspace.ownerTag || !r.resourceKey.startsWith(workspace.resourcePrefix) || r.environment === "production");
  if (unowned || !workspace.archivesVerified) {
    return {sandboxId: workspace.id, action: "QUARANTINE_FOR_EVIDENCE", resources: [], reason: unowned ? "UNVERIFIED_RESOURCE_OWNERSHIP" : "ARCHIVE_NOT_VERIFIED"};
  }
  if (workspace.state !== "ARCHIVED") {
    return {sandboxId: workspace.id, action: "QUARANTINE_FOR_EVIDENCE", resources: [], reason: "ARCHIVE_STATE_REQUIRED"};
  }
  return {sandboxId: workspace.id, action: "SCHEDULE_OWNED_CLEANUP", resources: [...resources], reason: "TTL_EXPIRED_OWNED_ARCHIVED"};
}

export function checkTenantConcurrency(active: readonly Workspace[], tenantId: string, maxPerTenant = 3, maxGlobal = 20): void {
  requireCondition(Number.isInteger(maxPerTenant) && maxPerTenant > 0 && maxPerTenant <= 20, "INVALID_TENANT_CONCURRENCY");
  requireCondition(Number.isInteger(maxGlobal) && maxGlobal >= maxPerTenant && maxGlobal <= 100, "INVALID_GLOBAL_CONCURRENCY");
  const open = active.filter(x => !["CLEANED", "FAILED", "QUARANTINED", "ARCHIVED"].includes(x.state));
  requireCondition(open.length < maxGlobal, "GLOBAL_CONCURRENCY_EXCEEDED");
  requireCondition(open.filter(x => x.tenantId === tenantId).length < maxPerTenant, "TENANT_CONCURRENCY_EXCEEDED");
}
