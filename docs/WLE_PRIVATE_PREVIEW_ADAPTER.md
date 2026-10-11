# WLE private preview adapter | branch-only release packet | 2026-10-11

## Scope and authority

- Canonical WLE design: `Strategic-Minds-AI/website-launch-engine@aed388468f17916f43a2ccc593981e4fbf1e8603`, `src/templates/roofing.html`, approved source Git blob `bf92408e9c495254f6a6c660b8bddd765cf6af62`.
- X1 base source: `Strategic-Minds-AI/x1-ai-hub-swarm-runtime@20ba518d7372f98ed2b7a778c5947a5b6231d5ca`.
- Target for future scoped activation: *existing* X1 preview worker, never a new worker or scheduler. Existing X1 signed authorization, lease and ledger remain mandatory.
- Destination: *existing private* `artifact-staging` bucket in X1 Staging Supabase `uvdkzsbjackpjvpoxtyk`. Object path is `wle-preview/<tenant_id>/<work_id>/index.html`.
- This branch creates NO website production deployment, DNS/domain, customer message, email/SMS, payments, public storage bucket, schema/RLS change, credential, new service or schedule.

## Current result and activation state

- Local JARVIS `npm test`: **87/87 PASS**, including TypeScript strict check, build, existing worker regressions and private artifact mock/readback scenarios.
- No live storage object has been uploaded by this feature branch yet. Mock HTTP tests are not proof of an actual generated asset.
- `WLE_PREVIEW_ADAPTER_ENABLED` defaults **OFF**. The live Railway worker is unchanged by a GitHub development-branch commit.
- **BLOCKER**: X1 Staging `x1_capability_registry` currently has no `wle-synthetic-preview-only` entry. Do not bypass signed X1 capability authorization or silently add privileges.
- **BLOCKER**: Shared preview worker staged activation requires independent QA and scoped operator permission to enable the nonsecret flag, with rollback.
- No automatic public Vercel preview or preview URL is created by this adapter. The output is private staging storage and a verified hash/receipt, followed by a separately reviewed preview exporter.

## Eligible synthetic packet contract

The original X1 enqueue function must construct a packet with the authenticated system tenant, scoped signed authorization, idempotency key and X1 lease. Only one fictional roofing preview is supported.

- `action_class`: `NON_PRODUCTION_MUTATION`
- `required_capabilities`: `[{"id":"wle-synthetic-preview-only","mechanism":"policy"}]`
- `task_id`: `wle.preview.synthetic.roofing-canary`
- `work_packet_id`: starts `WLE-PREVIEW-STAGING-`
- `source_sha`: `aed388468f17916f43a2ccc593981e4fbf1e8603`
- `approval_reference`: starts `WLE-STAGING-SYNTHETIC-`, but **this text is not authorization**. X1 must independently sign and verify the actual action and capabilities.
- `payload`: `{"kind":"WLE_SYNTHETIC_PREVIEW_BUILD_V1","template_id":"roofing","market":"Pompano Beach, FL","release_mode":"preview","delivery_mode":"private_storage","site_quantity":1,"synthetic":true,"no_customer_data":true,"no_spend":true,"customer_outbound":false,"requires_domain_purchase":false,"external_mutation":true,"expected_vercel_project_id":"prj_JbkX4yKWygqBFRhkHL6nbeQXM46f"}`
- `max_attempts=1` initially; do not auto-replay uncertain artifact uploads before independent storage-hash reconciliation.

## Safety checks

1. Run only with X1 runtime environment exactly `preview`, matching tenant/worker/lease; fail closed for any other environment.
2. Enforce exact staging Supabase URL before using the service-side environment's existing credentials. Never read or expose credential values in a receipt, log, browser or client.
3. Keep the premium pinned WLE source unchanged except invisible synthetic provenance. Require `noindex,nofollow` and fictional-business disclosure.
4. POST a bounded, non-overwriting private object and follow with authenticated GET and exact SHA-256 + byte-length verification. A conflicted object passes only if bytes exactly match; ambiguous writes cannot count as completed without readback.
5. Emit only nonsecret storage path, tenant/work ID, source/HTML hashes and byte counts to the existing X1 worker log/queue ledger.
6. Independently verify `storage.buckets.public=false`, object digest, queue status, tenant-specific lease, ledger receipt, and deployed exact code SHA before recording operational PASS.
7. Do not allow the WLE adapter to consume or perform production release, website bulk generation, customer operations or payments.

## Future approval-gated staging activation

1. Obtain independent review of the exact draft PR source SHA and all tests.
2. Verify the already-authoritative X1 control plane's capability authorization design. Register/authorize the narrow `wle-synthetic-preview-only` policy **only after scoped permission**; do not create a second registry.
3. Prepare reversible preview worker config with the existing deployed service and the nonsecret `WLE_PREVIEW_ADAPTER_ENABLED=true` flag. Require independent readback and rollback to `false`. No credential changes.
4. Run ONE tenant-authenticated synthetic staging packet. Independently confirm private object SHA, noindex, queue/lease/ledger and zero live website changes.
5. Only then design the existing WLE GitHub-to-Vercel preview exporter and separate release gate; never automatically promote from chat text.

## Rollback

- Until this branch is merged, close the draft PR or leave the isolated branch inactive; **the currently deployed X1 worker remains unchanged**.
- If later enabled in staging, first disable `WLE_PREVIEW_ADAPTER_ENABLED` and verify the existing worker's liveness/read-only queue still works; rollback to the previous exact Railway deployment if separate approval permits.
- Never wipe queue, ledger, stored artifacts or old immutable receipts as part of an automatic rollback.
