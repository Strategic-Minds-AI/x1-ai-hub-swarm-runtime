# X1 GPT Downloads: staging artifact-sync handoff

**Status: SOURCE ADAPTER TESTED, PERSISTENT DRIVE EXECUTOR NOT ACTIVATED**
**Scope:** Explicitly registered artifacts from supported X1/GPT generator runs only.
**Branch baseline:** X1 preview worker branch, not production or WLE storefront.
**Destination authority:** The separately bound private GPT Drive Sync v0.1.1 policy for the approved Strategic Minds account. Do not copy account emails or folder IDs into this public repository.

## Current provider evidence

- The existing staging Supabase project contains public.apex_output_events, public.apex_artifact_registry, public.apex_output_outbox, public.apex_destination_routes, public.x1_work_queue, leases and audit receipts. Reuse them.
- The live Railway preview worker executes the existing X1 queue with signed bootstrap authorization. Its gateway currently handles READ_ONLY and two guarded preview-specific mutations. It is **not** yet a Google Drive uploader.
- An earlier global route named drive.artifact-vault points to a different shared Drive root than the user's newly approved GPT Downloads folder. NEVER silently replace, merge or reuse that global route as the GPT Downloads destination. Resolve a tenant/project-scoped binding to the verified private policy first.
- Drive create-only upload, fresh remote download, exact-byte SHA-256 comparison, and receipt-folder creation were verified independently in the connected ChatGPT environment. This is a provider proof **inside that environment**, not evidence that Railway can call the same Google connection unattended.
- Railway preview shared runtime variable names do not include a verified persistent Google Drive credential or artifact upload bridge. Neither an AI model nor a stored skill grants an OAuth scope.

## Implemented here

The module src/gpt-drive-artifact-sync.ts is a narrow, reusable adapter to the **existing** worker and registry. It:
1. Requires preview runtime, NON_PRODUCTION_MUTATION, a fresh same-worker lease and an allowlisted X1 artifact task.
2. Requires the existing signed authorization scope with exactly one artifact-vault:gpt-downloads-create-only-v1 capability. The existing X1 signer/ledger must still validate its HMAC and idempotent execution claim.
3. Binds work to tenant, project, allowed producer, registered private artifact-staging source reference, approval reference and exact destination supplied by an authenticated runtime binding.
4. Allows one small synthetic text-only canary (<=64 KiB). Unknown formats or real client data remain out of scope pending validated scanner and authorization expansion.
5. Rehashes the original source bytes, requires a matching STAGE scan, looks up existing same-hash receipts before create-only upload, checks independently downloaded remote bytes/parent/drive, and writes a verification receipt.
6. Stops on an ambiguous receipt instead of declaring success or blindly repeating a write.
7. Adds no DB table, new queue, new scheduler, heartbeat, OAuth token, or external worker service.

## How to connect without unsafe shortcuts

- Authoritative generator registers artifact.finalized using the existing APEX event/registry transaction with a durable private storage object and full SHA-256; source must exist before enqueue. A sandbox path alone is not durable source evidence.
- The existing X1 control plane must mint a narrowly scoped artifact-vault capability for the exact tenant, actor, project, staging action and time window. Do not grant it merely because the user approved a high-level plan.
- Reuse the existing X1 work queue/lease/ledger and the existing worker heartbeat; route ONLY this task kind to the adapter via its signed authorization guard.
- Provide a **verified authorized GptDriveProvider** bound to the approved Google account and exact project folder. Its methods must read the actual private bytes, scan, find an existing full-hash receipt, create-only upload, redownload, verify and persist the hash-bound receipt.
- Authentication must be provisioned through an approved server-side credential/connection workflow; do not borrow ChatGPT session tokens, paste OAuth secrets or invent an unverified service URL. Host integration/credentials and any production permission changes need fresh scoped authorization.
- Only after the provider, staging binding, secure capability and independent validator are verified should the existing worker handler be enabled. Do not enable merely because tests pass.
- Trigger **one** synthetic source-backed TXT artifact canary through the existing staging queue, verify a new Google Drive file + independent SHA-256 readback + authenticated registry/outbox receipt, then check duplicate/expired source/interrupted upload/wrong-tenant cases before expanding MIME types or producers.

## Evidence and acceptance

- Source contract tests check correct tenant, project, producer, destination, action, source path, SHA, consent flags, lease, MIME, duplicates, remote parent and ambiguous receipt.
- npm test compiles TypeScript and runs the entire repository suite. Passing mock-provider tests is not a live worker or Google Drive PASS.
- Runtime PASS requires: exact deployment SHA, current provider identity, signed authorization receipt, one X1 staging queue work ID, registered input artifact ID, remote Drive file ID, byte-for-byte verification, validator receipt ID, completed outbox and no unauthorized retry.
- EXPECTED vs CONTENT_VERIFIED coverage is meaningful only for registered source artifact IDs. No cross-chat/global listener is installed. Direct ChatGPT downloads outside this generator cannot be captured by a worker if their bytes/event were never registered.

## Rollback / safety

Close the draft PR. No protected/default-branch merge, Railway deployment, staging SQL/ACL change, secret, OAuth scope, scheduled job, consumer communication, sharing or production release is included.

Current blocker: **NO_VERIFIED_PERSISTENT_GOOGLE_DRIVE_PROVIDER_ON_X1_WORKER**.
