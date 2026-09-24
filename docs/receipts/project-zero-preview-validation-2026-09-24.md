# Project Zero Preview Runtime Validation Receipt

**Date:** 2026-09-24  
**Scope:** Nonproduction Project Zero preview binding and X1 AI Hub Swarm Preview worker validation  
**Release classification:** PREVIEW ONLY / NOT PRODUCTION

## Approved scope
- Bind/provision nonproduction runtime for `project-zero/authorize-preview-20260924`.
- Configure required preview secrets.
- Bind preview authorization path to the existing X1 AI Hub Swarm Preview Railway worker.
- Validate health, capability authorization, Supabase receipts, work leasing, idempotency, and fail-closed behavior.
- No production merge, production DB migration, DNS change, customer messaging, or production release.

## Source / runtime bindings

### Swarm runtime
- Repo: `Strategic-Minds-AI/x1-ai-hub-swarm-runtime`
- Branch: `feature/mandatory-capability-bootstrap`
- Validated branch-head commit: `4f845b6eefdaf718279fdf391598867ecabd686c`
- Railway project: `X1 AI Hub Swarm Preview`
- Worker service: `x1-swarm-preview`
- Validated deployment: `a982449e-c9fd-497b-bfb9-1ed11065fe08`
- Railway deployment state: `SUCCESS`

### Project Zero control-plane preview
- Repo: `Strategic-Minds-AI/x1-ai-hub-control-plane`
- Branch: `project-zero/authorize-preview-20260924`
- Dual-stack preview commit: `e795c045b0fd194d3107d9cf558f879e4137a5f6`
- Railway service: `project-zero-control-plane-preview`
- Latest observed Railway state: `SUCCESS`

### Supabase staging
- Project: `X1 AI Hub Staging`
- Project ref: `uvdkzsbjackpjvpoxtyk`
- Preview DB gateway Edge Function: `project-zero-db-gateway`
- Authorization Edge Function: `project-zero-authorize`
- Both functions observed `ACTIVE`

## Validation evidence

### 1. Worker/runtime health
- Railway latest worker deployment state: `SUCCESS`.
- Worker healthcheck path configured: `/healthz`.
- Railway kept the worker deployment active after health gating.
- Direct external GET could not be independently fetched from the connector/tool surface during this run; Railway runtime status is the supporting health evidence.

**Result:** PASS WITH EVIDENCE LIMITATION

### 2. Supabase gateway transport
Supabase logs recorded `POST 200` from the preview gateway to `x1_lease_next_work` through the Supabase Edge Runtime after the gateway refactor.

**Result:** PASS

### 3. Work leasing
Happy-path work:
- Task: `project-zero.preview.e2e-read-v3`
- Work ID: `509693b2-8520-4abe-abc1-fbe9500a2d9b`
- Lease ID: `4213527c-2882-4ee5-8ae5-594c4409b896`
- Queue result: `COMPLETED`
- Attempts: `1`
- Lease result: `COMPLETED`

**Result:** PASS

### 4. Capability authorization
Happy-path authorization:
- Authorization ID: `auth_ec5025f9-8d53-4724-8915-7febd133979b`
- Required capability: `connector:supabase`
- Resolved capability: `connector:supabase`
- Allowed: `true`
- Blockers: `0`
- Receipt ID: `receipt_61d9bf81-24a1-4dc0-8ebb-b93565bf8261`

**Result:** PASS

### 5. Bootstrap receipt persistence
- Receipt ID: `receipt_61d9bf81-24a1-4dc0-8ebb-b93565bf8261`
- Allowed: `true`
- Blocker count: `0`
- Receipt content hash persisted in `x1_bootstrap_receipts`.

**Result:** PASS

### 6. Execution ledger
Happy-path execution:
- Execution ID: `2385f101-575d-42f8-813f-710fab837a7b`
- Task: `project-zero.preview.e2e-read-v3`
- State: `COMPLETED`
- Attempt: `1`
- Worker receipt: `worker:509693b2-8520-4abe-abc1-fbe9500a2d9b:1`

**Result:** PASS

### 7. Idempotency
A second enqueue attempt using the same happy-path idempotency key returned:
- Duplicate rows inserted: `0`

The unique queue constraint also rejected re-insertion of the already-existing fail-closed validation idempotency key.

**Result:** PASS

### 8. Fail-closed behavior
Negative-control task:
- Task: `project-zero.preview.failclosed`
- Work ID: `c1c908bd-2b34-4368-93b8-b6266def2535`
- Queue state: `BLOCKED`
- Attempts: `1`
- Error code: `CAPABILITY_BOOTSTRAP_BLOCKED`
- Authorization allowed: `false`
- Required capability: `chatgpt:tool-surface`
- Resolved capabilities: none
- Blocker: `UNAUTHORIZED+UNVALIDATED`
- Receipt ID: `receipt_408e4bdd-e52a-422b-b02d-d75c9e7d36d5`
- Execution-ledger rows for blocked task: `0`

This proves the worker did not execute a task whose required capability failed authorization.

**Result:** PASS

## Historical failure evidence retained
Earlier validation work packets reached `DEAD_LETTER` / retry failure while the original Railway-to-Railway control-plane transport was unresolved. Those failures were not deleted or rewritten. The final validated path uses the staging Supabase authorization endpoint plus the internal service token and derived signing key.

## Security / governance notes
- No production merge performed.
- No production database migration performed.
- No DNS change performed.
- No customer messaging performed.
- No production release approved or performed.
- Preview and staging resources only.
- Secret values are intentionally omitted from this receipt.
- Preview PASS does not equal production PASS.

## Final preview gate
**PROJECT ZERO PREVIEW VALIDATION: PASS**

Production remains separately approval-gated and requires its own final SHA validation, production-environment review, and release authorization.
