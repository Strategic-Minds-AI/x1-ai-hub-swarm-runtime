# Ephemeral Sandbox Fleet V1 | Digital Dominance
Status: **source implemented + X1 Staging metadata schema applied + CI tests; not attached to live worker or cloud sandbox executor**.
This is a component of the EXISTING X1 worker/control plane, not a parallel platform.

## What already exists
- `src/ephemeral-sandbox-fleet.ts`: deterministic IDs, TTL max 120 min, lease state machine, resource ownership/prefix enforcement, tenant and global concurrency, fail-closed budgets, expiry cleanup planning.
- `src/sandbox-preview-pipeline.ts`: typed builder → separate validator → bounded repair (max 3) → hash-bound artifact archive. Mocked provider adapters are tested. It DOES NOT call production providers.
- `tests/ephemeral-sandbox-fleet.test.mjs`: 30 sandbox policy regression tests.
- `tests/sandbox-preview-pipeline.test.mjs`: 10 synthetic builder/validator/repair tests.
- `sandbox-fleet/sql/staging_private_registry_v1.sql`: migrated to X1 AI Hub STAGING project `uvdkzsbjackpjvpoxtyk`, with private `sandbox_fleet.workspaces`, `resource_receipts`, and `workspace_events`. All 3 RLS enabled. `anon` and `authenticated` have no SELECT. 0 rows at installation.

## Provider design (reuse, never clone everything per client)
- GitHub: one approved repository/monorepo; short-lived feature worktrees/branches tagged to the sandbox; no merges to protected branches. Keep the immutable build SHA and receipt.
- Vercel: isolated named sandbox VM only for eligible code execution; preview deployments for finished builds. Network DENY-ALL or explicit allowlist. No production deployment. Named sandboxes have usage charges; provisioning is disabled until an approved budget envelope exists.
- Railway: existing supervised worker pool processes X1 leased work. DO NOT create a new Railway project or worker/cron for every client.
- Supabase: existing X1 Staging stores the private metadata registry plus synthetic tenant-scoped fixtures; NO per-job full database by default. Optional paid preview branches require separate budget/security authorization; never copy production personal data.
- Google Workspace: approved Drive destination for client deliverables and permanent proof; temporary generated artifacts remain in isolated sandbox storage until validated. Avoid creating permanent Drive folders for failed experiments.

## Operate without repetitive permissions
Define an immutable, operator-approved `sandbox_autonomy_envelope` once, including allowed tenants, approved resource namespace, max lifetime, daily budget, maximum workers, provider accounts, time window, and rollback.
Within that envelope: deterministic research, branch edits, sandbox file deletion, compilation, independent QA, repair, synthetic testing, and ephemeral artifact cleanup are automatic.
Always protected: production deploy/merge, production DB/RLS, real customer messages, email/SMS, DNS, secrets/permission changes, payments/spend outside the signed budget, and deleting any resource not tagged and verified as sandbox-owned.
No approvals may be inferred from silence; authority is retained only via signed receipts.

## Activation gates
1. Resolve and independently validate X1 actual scheduler/worker identity and existing authorization faults.
2. Wire these modules to one existing X1 worker; add service-side adapters and durable lease CAS, no duplicate queues or timers.
3. Run synthetic integration in staging, prove real preview build and recorded receipt.
4. Review Vercel sandbox charges and establish a precise tenant/global budget (initial default $0).
5. Verify enforced provider ownership scopes, tenant-isolation and post-expiry cleanup using actual returned external IDs.
6. Observe unattended worker restart and lease recovery for multiple cycles, then label staging AUTONOMOUS.
7. Gate production promotion with independent validation and operator approval.
