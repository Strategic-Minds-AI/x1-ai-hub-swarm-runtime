# Power Grid Local Bridge

## Purpose
Connect the existing X1 staging queue to the JARVIS local Docker execution plane without creating another queue.

## Authority
- Durable queue: X1 AI Hub Staging `x1_work_queue`
- Lease RPC: `x1_lease_next_work`
- Execution ledger: `x1_execution_ledger`
- Authorization: Project ZERO Control Plane
- Local execution: JARVIS control plane at `http://host.docker.internal:4311`

## Initial safety envelope
The bridge is intentionally limited to:
- `X1_RUNTIME_ENV=preview`
- worker IDs beginning `jarvis-local-`
- `action_class=READ_ONLY`
- `payload.execution_target=jarvis-local`

All other work fails closed.

## Runtime configuration
Configuration is environment-only. No secrets belong in the repository.

Required:
- `X1_SYSTEM_TENANT_ID`
- `X1_CONTROL_PLANE_URL`
- `X1_DB_GATEWAY_URL`
- `X1_INTERNAL_SERVICE_TOKEN`

Optional:
- `X1_WORKER_ID` (default `jarvis-local-power-grid-1`)
- `X1_WORKER_POLL_MS` (default 5000)
- `LOCAL_CONTROL_PLANE_URL` (default `http://host.docker.internal:4311`)
- `LOCAL_TASK_POLL_MS` (default 1000)
- `LOCAL_TASK_TIMEOUT_MS` (default 120000)

## Rollback
Stop the bridge process/container. Existing JARVIS local queue and Railway preview worker remain unchanged.
