# Universal Worker Fabric v1

## Purpose
Replace worker-name-prefix trust with registered worker identity and a staged attestation contract while preserving the existing X1 queue, lease, authorization, execution ledger, Railway failover, and JARVIS sandbox boundaries.

## Current verified baseline
- Power Grid bridge remains staging/preview only.
- JARVIS bridge profile remains disabled until approved credential binding.
- PR #4 remains draft and unmerged.
- Current live X1 lease RPC still contains prefix routing for `jarvis-local-%`.
- X1 queue, lease, execution ledger, and audit tables have forced RLS.
- Critical execution RPCs are restricted to postgres/service_role.

## Worker Fabric v1 identity
Each worker is registered with:
- worker_id
- tenant_id
- execution_plane
- environment
- enabled
- identity_version
- artifact_digest
- credential_id (opaque identifier, never the secret)
- credential_binding_state
- allowed_action_classes
- allowed_capabilities
- identity_fingerprint
- registered_at / last_heartbeat

The identity fingerprint is deterministic software/configuration identity. It is **not hardware cryptographic attestation**. True cryptographic/TPM attestation remains a later layer.

## Two-phase database rollout

### Phase A — registry only
`schemas/x1_worker_registry_v1.sql`

Creates a private registry and a service-role-only assertion RPC. It does **not** replace the lease function.

Safe rollout target:
1. X1 AI Hub Staging only.
2. Register Railway preview first and validate it.
3. Register JARVIS disabled + UNBOUND.
4. Do not enable JARVIS until its approved staging credential binding exists.

### Phase B — lease enforcement
`schemas/x1_worker_registry_v1_enforcement.sql`

Replaces prefix-only lease authority with registry checks:
- worker registered
- enabled
- tenant/environment match
- credential BOUND
- execution plane matches requested target
- action class allowlisted
- required capability IDs allowlisted

It also requires registered identity during execution claim.

**Do not apply Phase B until all currently legitimate staging workers are registered.**

## Local bridge behavior
The JARVIS bridge now requires these non-secret identity variables in addition to its protected credential:
- `X1_WORKER_IDENTITY_VERSION`
- `X1_WORKER_ARTIFACT_DIGEST`
- `X1_WORKER_CREDENTIAL_ID`

It calls `x1_assert_worker_identity` before requesting a lease. A missing registry RPC, disabled worker, unbound credential, context mismatch, identity drift, or registry rejection fails closed.

## Security boundaries
No plaintext credential is stored in the registry or work packet.
No self-registration API exists.
Registry application and credential binding are protected actions.
Production remains unauthorized.
JARVIS remains disabled until the credential gate is explicitly cleared.

## Rollback
Source rollback marker before Worker Fabric v1: `e8f768d51b7bb5f415d7c55f1eebe5e4e158436c`.

Database rollback must be prepared before Phase A/Phase B application and tested in staging. Until then, the SQL files are contract drafts only.

## Promotion gate
Worker Fabric v1 is not production-grade until:
1. Railway is registered and validated.
2. JARVIS is registered disabled.
3. approved staging credential is bound without exposing its value.
4. JARVIS direct signed canary passes.
5. deliberate JARVIS failure routes work to Railway.
6. JARVIS recovery restores routing.
7. independent Guardian validation passes.
