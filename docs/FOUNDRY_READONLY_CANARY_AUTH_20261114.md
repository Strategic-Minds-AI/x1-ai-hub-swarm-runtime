# Digital Dominance Foundry | Real X1 staging authorization canary
Date: 2026-11-14. REVIEW ONLY, production release LOCKED.

## Canonical mission and proof scope
- X1 mission task: `6af8100ae683c9a6de21746c`
- Foundry mission: `DDUF-9892316a3cf4c261`
- Foundry source: `Strategic-Minds-AI/google-first-programmatic-seo-template` Draft PR #2, source at canary `ab3a81ce977baf9f8e50db27f40676f6fda3557b`.
- X1 staging Supabase project `uvdkzsbjackpjvpoxtyk` only; no production DB or customer messaging.

## Real staging execution observations
1. A first authorized staging `x1_enqueue_work` invocation with a human-readable idempotency key failed before insertion with check constraint `x1_work_queue_idempotency_key_check`, requiring **64 lowercase SHA-256 hex**. The failure was not silently retried unchanged.
2. The corrected 64-hex idempotency key successfully created one `READ_ONLY` staging work item, work_id `3ae5ccce-19d1-4df1-a22d-74ab9d4f98c4`.
3. The already registered worker `x1-swarm-preview-1` actually acquired lease `c6594902-8f02-4ea5-8216-1f0c3cb2ec28`. Queue row source SHA and mission ID were read back, and lease holder matched the worker.
4. The worker recorded work status `BLOCKED`, `attempts=1`, `max_attempts=1`, `last_error_code=CONTROL_PLANE_AUTHORIZATION_FAILED`. Lease status was `RELEASED`. No matching execution-ledger completion was found. No client/CRM/output action occurred.
5. No bootstrap authorization row was created for this task. This indicates a control-plane response failed before a durable authorization receipt was stored, but the HTTP status and server error were lost because the deployed worker persisted only the prefix before `:`.

## Root cause candidates (NOT certified)
- The existing X1 worker `ControlPlaneClient` calls `{X1_CONTROL_PLANE_URL}/api/authorize` unless the base URL already contains `/functions/v1/`.
- The Vercel project linked to `Strategic-Minds-AI/x1-ai-hub-control-plane`, `strategic-minds-zero-control-plane`, has a preview deployment at commit `d2bd77289ffb88fe1237fe13a9b538fadb663488` with API routes but **no `api/authorize` source path**. Its main branch also lacks that handler. **Railway's actual X1_CONTROL_PLANE_URL value is redacted**, so a bad-route explanation is plausible, not verified.
- A separate cause could be an expired/invalid internal service token, wrong environment target, or a mismatched request schema. Do not assume the route is the worker's actual target.

## Reused existing recovery PR
This evidence applies to existing Draft PR #7 `feature/x1-autonomy-auth-failclosed-20261011`. We preserved the existing fail-closed behavior and added sanitized diagnostic retention: `CONTROL_PLANE_AUTHORIZATION_FAILED:<HTTP_4xx_or_5xx>:<UPPERCASE_PROVIDER_CODE>` in durable `last_error_code`. The worker still reports generic `CONTROL_PLANE_AUTHORIZATION_FAILED` to its caller and blocks without executing the handler. Arbitrary response text, tokens and untrusted lower-case errors must not be persisted.

## Next safe execution gates
1. Verify the actual worker-configured URL by authorized Railway readback or a safe server-native diagnostic, without exposing any credentials. Check the real endpoint HTTP response and provider code.
2. Bind the worker to the *existing* authorized control-plane endpoint. Repair a missing route only after confirming ownership, auth and signing policies. Do not point the worker to an unverified endpoint.
3. Obtain exact-SHA independent Guardian review of this change. Test source against the existing QA suite; do not merge or redeploy until required gates pass.
4. Only after that, issue one NEW idempotent, read-only preview canary using the accepted worker capability schema. Require a real lease, authenticated authorization receipt, completion ledger and queue readback. Never replay the blocked packet or override authorization.
5. After read-only chain PASS, proceed to the separately authorized tenant-isolated, consented `example.test` staging CRM write/readback, no customer outbound.

## Safety, cost and rollback
Default incremental spend $0. No production config, subscription, OAuth, DNS, destructive DB, external email/call, protected merge, or active provider secret was changed. Rollback is to leave this PR unmerged and the existing Railway deployment unchanged. A blocked canary is NOT a completed Foundry execution.

## Provider evidence pointers
- Staging queue work_id `3ae5ccce-19d1-4df1-a22d-74ab9d4f98c4`
- Staging lease `c6594902-8f02-4ea5-8216-1f0c3cb2ec28`
- Existing X1 Runtime source repository: `Strategic-Minds-AI/x1-ai-hub-swarm-runtime`
- Existing Foundry PR: https://github.com/Strategic-Minds-AI/google-first-programmatic-seo-template/pull/2
- Existing worker fail-closed PR: https://github.com/Strategic-Minds-AI/x1-ai-hub-swarm-runtime/pull/7
