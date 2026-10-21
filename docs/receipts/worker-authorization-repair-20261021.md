# Worker Authorization Repair Receipt

Work packet: X1-CONVERGENCE-WORKER-REPAIR-20261021
Branch: fix/worker-authorization-failure-detail-20261021
Base: 3ee70d1e75ce4935e8072d1dcdbfe5c8ef6bd894 (main, unchanged)
Rollback reference: delete this branch; main was never moved and no deployment was triggered from it.

## 1. The authorizer was tested, not rebuilt

project-zero-authorize is ACTIVE at version 5 and its contract matches the runtime client field for field:

- The client POSTs taskId, agentId, tenantId, requestedAction and requiredCapabilities; the function reads exactly those names and rejects an empty capability list with 400 INVALID_AUTHORIZATION_REQUEST.
- The function answers the same snake_case authorization object the worker verifier expects (task_id, agent_id, tenant_id, allowed, blockers, receipt_id) plus an HMAC-SHA256 signature over the canonical unsigned body.
- The signing key is derived identically on both sides from the internal service token, so no separate signing secret is required.
- Live probes: GET returns 200 {ok:true,service:"project-zero-authorize"}; a POST with no credential returns 401 UNAUTHORIZED; a POST with an unregistered credential returns 401 UNAUTHORIZED.
- It is the path that ran: 48 x1_bootstrap_authorizations rows exist, the last at 2026-10-16 22:52:27 for agent x1-swarm-preview-1 requesting READ_ONLY with connector:supabase, and 46 execution-ledger rows COMPLETED with 46 receipts.

CONCLUSION: no /api/authorize endpoint is required. The correct worker configuration is X1_CONTROL_PLANE_URL pointing at the functions/v1/project-zero-authorize URL, which the client passes through unchanged.

## 2. Worker deployment identity

- Entry: dist/worker-main-gateway.js (Dockerfile CMD, railway.json healthcheck /healthz, PORT 3000).
- Required runtime configuration: X1_SYSTEM_TENANT_ID, X1_CONTROL_PLANE_URL, X1_DB_GATEWAY_URL, X1_INTERNAL_SERVICE_TOKEN.
- Optional: X1_WORKER_ID, which defaults to x1-swarm-preview-1, the identity that held 118 leases and produced the 46 completions; also X1_RUNTIME_ENV, X1_WORKER_POLL_MS, RAILWAY_GIT_COMMIT_SHA for the source SHA.
- Queue and ledger transport: the project-zero-db-gateway function (GET returns 200, unauthenticated POST returns 401).
- Hosting: a long-running Docker service (Railway-oriented). The Railway credential available to the Visual X application is project scoped and cannot enumerate or modify services (workspace query returns Not Authorized), so the worker host is not reachable from the application.

## 3. Lease eligibility and credential binding, no credential values

- One live worker heartbeats: jarvis-local-power-grid-1, 232,578 beats, ONLINE, execution plane jarvis-local, artifact digest present.
- Its health payload is {mode: SENSOR_ONLY, lease_requested: false, local_control_plane: http://control-plane:4311}. It is a sensor against a local control plane, so it cannot authorize against staging.
- The registered credential row is x1_service_auth_hashes.service_name = project-zero-preview, active, and the authorize function binds to exactly that service name through x1_match_worker_auth.
- x1_match_worker_auth and x1_worker_status_summary are not readable by the application read-only database role (permission denied), so deeper eligibility cannot be asserted from here. No credential value was read, printed or changed.

## 4. Repair implemented on this branch

Two defects discarded exactly the evidence needed to repair authorization failures. Both are fixed in src/worker-orchestrator.ts, and neither changes authorization behavior:

- codeFor() kept only the text before the first colon, so CONTROL_PLANE_AUTHORIZATION_FAILED:403:INVALID_AUTHORIZATION_REQUEST was stored as CONTROL_PLANE_AUTHORIZATION_FAILED. The queue row now keeps the full detail (bounded to 240 characters).
- A blocked authorization stored the constant CAPABILITY_BOOTSTRAP_BLOCKED. The row now also names the capabilities that blocked it, for example CAPABILITY_BOOTSTRAP_BLOCKED:chatgpt:tool-surface=UNAUTHORIZED.
- Control flow is unchanged: the stable code is still returned to the caller and still drives the non-retryable classification.

## 5. Verification

tests/worker-failure-detail.test.mjs pins both behaviors against the built output, so it runs in the repository own CI (npm test: typecheck, build, node --test tests/*.test.mjs). CI runs on push to non-main branches and on pull requests.

## 6. Not done, deliberately

- No /api/authorize endpoint created, and no second authorizer.
- No capability granted, no queue row written, no job submitted, no worker created.
- No credential rotated, no permission changed, no production release, no bind endpoint bypassed (it still answers 410 BOOTSTRAP_CLOSED).

## 7. Exact remaining action

Start or repair the worker service with X1_CONTROL_PLANE_URL set to the functions/v1/project-zero-authorize URL, X1_DB_GATEWAY_URL set to the functions/v1/project-zero-db-gateway URL, the tenant id, and the internal service token whose sha256 is the active row in x1_service_auth_hashes. Then submit one idempotent READ_ONLY job and verify: one lease row for the worker, one execution-ledger row COMPLETED with a receipt id, one x1_bootstrap_authorizations row for the task, the source SHA, and the rollback reference.
