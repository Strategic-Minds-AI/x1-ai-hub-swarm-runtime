# X1 AutoBuild V2 | Executable scaffolding, dormant by default
2026-10-11 | branch-only, no live runtime mutation

## Status
This branch adds `autobuild-mission.ts` (deterministic dependency scheduler) and `autobuild-pipeline.ts` (up to three bounded dry-run propose/independent-verify/repair attempts with durable receipt callback). It does NOT enable external inference, live code pushes, persistent dispatch, database writes, paid jobs, or GPU. Existing worker handler stays READ_ONLY.

## Real control plane
- Canonical queue: staging Supabase `uvdkzsbjackpjvpoxtyk` `x1_work_queue`.
- Lease/heartbeat/ledger: existing `x1_task_leases`, `x1_execution_ledger`, `x1_audit_receipts`, `x1_worker_heartbeats`.
- Supervisor: Railway `X1 AI Hub Swarm Preview`, service `x1-swarm-preview`.
- Auth: existing signed bootstrap authorization + scoped work packet + idempotency key. No duplicate heartbeat.

## Minimum end-to-end pipeline after approvals
MISSION JSON -> dependency graph -> authenticated X1 queue -> existing Railway worker -> mandatory capability authorization -> authorized sandbox with model via Vercel AI Gateway -> proposal restricted to allowed paths -> isolated GitHub branch -> GitHub Actions typecheck/build/tests -> *independent* validator refetches SHA and runtime -> pass/failed receipt -> bounded repair -> next eligible safe packet. Protected gates go to approval inbox and cannot self-approve.

## Runtime switch and controls
**No switch is activated in this PR.** Future integration should add a code handler *inside* existing `src/worker-main-gateway.ts`, behind a narrowly scoped flag `X1_ENABLE_CODING_AGENT=false` by default plus verified authorization for NON_PRODUCTION_MUTATION, exact allowed repo/branch/SHA, budget, sandbox and independent reviewer. NEVER start a new Railway service just to poll the same queue. Enforce at-most-one worker lease per packet via existing DB idempotency RPC.

## Repair discipline
A failure classification is a receipt, not automatically permission to rerun a dangerous action. Missing independent evidence, invalid source/paths or auth is fail-closed. Up to 3 bounded repairs for validated, reproducible code defects. No retry for rights, secret, tenant isolation, spend or protected release problems.

## Acceptance tests
- unit: DAG progression, protected task hold, failed dependency, duplicate ID.
- unit: deterministic normalized code packet; allowed paths, SHA, action class.
- unit: bounded proposal/verification loop, independent evidence required, invalid path hard block.
- later integration: authenticated RLS/worker lease canary, branch-only proof PR, actual Gateway model+spend/latency, code sandbox and independent QA.
CI must pass `npm test` before activating anything.

## Next work packets
- X1-CODE-010: authorized adapter to Vercel AI Gateway in isolated zero-privilege sandbox; explicit budget.
- X1-CODE-011: typed GitHub branch writer that cannot reach protected branches and ensures SHA lease.
- X1-CODE-012: independent validator that re-fetches source tree and Vercel preview/CI.
- X1-CODE-013: existing X1 Railway handler integration behind default-off flag.
- X1-CODE-014: signed staging queue canary, receipt, cleanup and no duplicate cron.
- X1-EDEN-001: approved original face and voice verified; independent rendering GPU study then live integration.
