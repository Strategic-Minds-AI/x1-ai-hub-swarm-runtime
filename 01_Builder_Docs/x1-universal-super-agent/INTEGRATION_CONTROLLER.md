# X1 Universal Super Agent Integration Controller (2026-10-12)

PHASE: BRANCH-SAFE INTEGRATION. STATUS: STAGED; NOT ACTIVATED.

## Verified targets
- Canonical repository: Strategic-Minds-AI/x1-ai-hub-swarm-runtime
- Integration branch: feature/x1-universal-agent-kit-20261012
- Baseline: feature/x1-prompt-to-vercel-preview-v1-20261011
- Supabase staging project: uvdkzsbjackpjvpoxtyk
- Railway project: X1 AI Hub Swarm Preview (f442cf0a-7275-4c2b-bf73-2dda4254e002)
- Railway services: x1-swarm-preview, project-zero-control-plane-preview
- WARNING: Railway environment ID d4cd61a5-fe51-4eba-afb7-286267861734 is actually named production and is PROTECTED.
- Local authorized root: C:\_Strategic_Minds_AI_OS

## Incoming modules (donor contracts, never automatically executable)
1. Control plane: work packet schema and role routing: compare to existing canonical contract before adopting.
2. Build factory: acceptance rules and builder documents: preserve existing execution engine.
3. Visual factory: brand/page recipes and visual validation: branch-only assets.
4. Provider adapters: TypeScript starter skeleton; NOT authenticated production MCP connectors.
5. Scale fleet: batch governance and idempotency specifications, NO new scheduler.
6. SEAL TEAM: alternate versions, deduplicate.
7. Vision Cortex application: review licensing, Base44 dependencies, security before migration.
8. Base44 Super Agents: extract useful UI and workflows only after dependency remediation.

## Supabase mapping (READ-only until separate schema approval)
x1_work_queue => dispatched work packets
x1_task_leases => single-owner lease
x1_execution_ledger => idempotency
x1_audit_receipts => external receipts
x1_worker_heartbeats => worker identity and freshness
x1_capability_registry + x1_bootstrap_authorizations => authorization gates

## Railway alignment
Existing source branch must be pinned to an exact SHA for review. Do not retarget Railway or deploy in the environment named production without scoped approval. Do not create a second heartbeat, supervisor, or new runner. Existing secrets are provider-managed: never copy values.

## Swarm coordination
Use live registered Coordinator, Builder, Browser, Tester, Reviewer, Deployer and Guardian where independently verified. Role names in uploads are templates, not deployed agent proof. Dispatch only through verified canonical queue/schema and verified supervisor ownership.

## Required activation gates
[ ] ZIP/file security audit (secrets, binaries, path traversal, license and dependency review)
[ ] manifest and schema compatibility diff
[ ] source SHA identity
[ ] successful build, typecheck and all tests
[ ] two-session lease contention: one winner, one rejection, one execution
[ ] scoped authorization and feature-flag verification
[ ] safe synthetic website preview test and QA from distinct validator
[ ] receipt correlation to worker, work ID, SHA and checksum
[ ] independent guardian PASS
[ ] protected deployment/secret/production approval if applicable

Rollback: revert this isolated branch, not the existing deployed preview. No direct production changes were authorized by this controller.
