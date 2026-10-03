# Power Grid Hardening Receipt — 2026-10-03

## Scope
Staging-only hardening for the JARVIS local bridge and X1/Railway Power Grid. No production mutation, secret mutation, billing, DNS, public publishing, customer messaging, or destructive action.

## Bridge input controls
- READ_ONLY action class required.
- execution_target must equal jarvis-local.
- payload environment limited to staging/preview.
- local task type allowlisted to agent_request.
- local agent role allowlisted.
- idempotency key must be 64 lowercase hex characters.
- work packet, task, requester, role and task type text fields are bounded.
- packet payload limited to 64 KiB.
- nested payload depth is bounded.
- secret-like payload keys are rejected fail-closed.
- returned local task id and status are verified before completion is accepted.

## Runtime controls
- bridge runtime is preview-only.
- bridge health response no longer exposes the local control-plane URL.
- dedicated minimal bridge image; no Git, Python, pip, make, or compiler toolchain.
- Node base image pinned to sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c.
- local compose bridge profile uses a dedicated network, 256 MiB memory, 0.25 CPU, 64 PID limit, read-only root filesystem, all Linux capabilities dropped, no-new-privileges, and no host port.
- bridge source is copied into the image; no live host source mount.
- bridge profile remains disabled until an approved staging X1 credential binding exists.

## X1 data-plane audit
- x1_work_queue: RLS enabled and forced.
- x1_task_leases: RLS enabled and forced.
- x1_execution_ledger: RLS enabled and forced.
- x1_audit_receipts: RLS enabled and forced.
- service-role-only RLS policies verified on all four tables.
- lease/finish/claim/complete/fail RPC EXECUTE privilege is limited to postgres and service_role.

## Validation
- TypeScript typecheck: PASS.
- Build: PASS.
- Local bridge tests: PASS 8/8.
- npm audit: 0 vulnerabilities at info/low/moderate/high/critical.
- hardened Docker Compose config validation: PASS.
- pinned minimal bridge image build: PASS.

## Residual risk
The current X1 lease RPC distinguishes local work partly by worker-id prefix. Before production-grade direct JARVIS binding, migrate to a registered worker identity / attested worker contract rather than relying only on a prefix.

## Rollback
Local pre-hardening compose backup:
C:\\_Strategic_Minds_AI_OS\\02 Active Builds\\local-agent-containers\\compose.pre-hardening-20261003.yaml

Rollback is: stop/remove only the power-grid profile, restore the pre-hardening compose file, and keep the existing Railway preview worker and X1 queue unchanged.
