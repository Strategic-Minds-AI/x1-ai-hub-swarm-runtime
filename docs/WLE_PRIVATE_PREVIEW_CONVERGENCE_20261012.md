# X1 Existing Worker | WLE Private Preview Convergence | 2026-10-12

This document accompanies a **development-only** compatibility branch. It reconciles the previously tested Website Launch Engine preview adapter with the actual newer X1 worker candidate. It is **not** authorization to change an existing shared worker or install another.

## Source and scope
- Current branch base frozen at `Strategic-Minds-AI/x1-ai-hub-swarm-runtime@a4c099f1dcd067287b5e57299dcb12bdd80e2443`, incorporating the separate new X1 prompt-to-preview QA work. Its immediate deployed ancestor was `dd186b7de199f05998e5c69a41d8af1547e28eb2` at observation. Re-fetch provider evidence before activation.
- Donor WLE adapter: X1 draft PR #11 `a7e6ff6bff5dd0d008bf572e8449612e1daa77ce`, derived from approved WLE template source `aed388468f17916f43a2ccc593981e4fbf1e8603`.
- Preserve **one worker** and its original X1 queue/supervisor/lease/receipt implementation. Keep generic `X1_PROMPT_TO_VERCEL_PREVIEW_V1` independently gated, unchanged.
- The private WLE mutation can only run with `WLE_PREVIEW_ADAPTER_ENABLED=true` and `X1_DB_COMPLETION_FENCING_PASS=true` in `X1_RUNTIME_ENV=preview`, under a matching signed authorization with **exact** `wle-synthetic-preview-only` policy scope and worker/tenant lease.
- Fixed synthetic design: fictional noindex full-page roofing, Pompano Beach, Florida; quantity 1; existing private `artifact-staging` bucket in X1 staging Supabase `uvdkzsbjackpjvpoxtyk`. The adapter is not a general-purpose site generator.

## Tests and remaining gates
- Unit/integration tests from donor X1 PR #11 include immutable template/content SHA, one private synthetic POST + authenticated SHA readback mock, same-idempotency conflict checks, cross-tenant denial, action-class denial, signed permission-scope denial, revoked lease/worker mismatch, and security failure.
- A compatibility contract test asserts the **generic** prompt-to-preview pipeline survives and requires its original independent QA; no other worker or scheduler was created.
- All test evidence refers to exact commit and must be independently rerun after code changes. Mock POSTs are not evidence of live Supabase objects, GitHub web previews, Vercel screenshots or actual revenue.
- At time of planning, staging does not contain an authorized `wle-synthetic-preview-only` registry capability; the running Railway worker does **not** expose `WLE_PREVIEW_ADAPTER_ENABLED`.
- Staging capability registration and preview flag activation are protected permission/runtime actions, not included. So are credentials, IAM, production, DNS, customer messaging, spend, RLS and merges.
- Perform ONE synthetic WLE job only after scoped approval; independently verify queue, lease, signed authorization, private storage exact SHA/bytes and the independent Guardian receipt, then a separately approved Vercel noindex preview exporter.

## Rollback
Close the draft convergence PR or leave unmerged: Railway continues its independently deployed source, and no runtime or X1 staging mutation occurs from code review. If later approved to activate, first disable the WLE flag and read-back worker status, then perform rollback only under exact deployment scope.
