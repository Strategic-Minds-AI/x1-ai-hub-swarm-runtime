# Strategic Minds DR V2: Drive <-> Vault synthetic cloud restore

Status: **PASS, synthetic cloud restore only**. Production backup activation: **BLOCKED**.

This document extends [PR #19](https://github.com/Strategic-Minds-AI/x1-ai-hub-swarm-runtime/pull/19) and reuses its existing X1 queue, leases, authorization, execution receipts, and cloud Drive adapter contract. No duplicate worker, scheduler, key store, or Drive gateway should be created.

## Verified synthetic receipt, 2026-10-17

- Tenant: strategic-minds-ai, NO client or production data.
- Vault project: X1 AI Hub Staging `uvdkzsbjackpjvpoxtyk`, using pre-existing canary alias `smai_nonprod_restore_dek_v1_20261017`.
- Key reference: `35135e51-ef02-4ef5-b6cd-807277dd0445`. The key value was never returned to ChatGPT.
- Encryption: Supabase SQL `pgcrypto.pgp_sym_encrypt`, OpenPGP AES-256 / S2K mode 3. This is NOT the earlier AES-GCM ephemeral-key canary.
- Cloud Drive account: `jeremy@strategicmindsai.com`; approved folder `07_DATA_AND_RETENTION`, ID `1j1vFMvc20EMPhm_J-1UPy_Bba4rVnfni`.
- Create-only encrypted object: `SMAI_DR_20261017-vault-staging-v2.pgp`, ID `1Z9kcr9_K3Km7BJGXvquyssQl2Vr9QSDw`, 150 bytes.
- SHA-256: `123d11c366002c349d449cf0c3e129d07120db1a597ae27e20bfa253471805cf`.
- Actual upload path reused existing **JARVIS rclone** binding; permanent off-Dell backup producer NOT achieved.
- Independent recovery fetched from Google Drive into ChatGPT cloud container, checked full SHA-256, and submitted ciphertext to Supabase SQL backend in a distinct query. The SQL result was `drive_restore_verified=true`, `restored_cipher_bytes=150`, `vault_alias_count=1`. Dell was NOT involved in recovery. Corrupted ciphertext was rejected with `Wrong key or corrupt data`.
- Vault grants checked: anon and authenticated have no schema usage or SELECT on `vault.decrypted_secrets`. Staging `pg_cron` installed, with zero registered jobs at inspection.
- Google Drive metadata receipt: `SMAI_DR_V2_Cloud_CrossProvider_Receipt_20261017.json`, Drive ID `1JQ-RGWp_ELfzY2gFJ8IDfrD0e80znX89`.

## Existing PR #19 source and missing cloud binding

The draft PR already has a provider abstraction, tenant/lease/source checksum checks, and fail-closed receipts. It reports that its Railway preview worker lacks a persistent approved Google Drive upload/download provider. Do NOT infer that the ChatGPT OAuth connector or the Dell's `rclone` session is a Railway credential.

Use this PR's existing artifact path and X1 event bus, not a new queue/cron. Before enabling cloud uploads, obtain an exact-tenant scoped managed identity and a Drive connection restricted to the approved folder, with independent byte hash validation. All operations remain create-only until operator-approved protected changes and staging receipts.

## Cloud worker acceptance contract

1. Verify authenticated tenant, project, job/lease identity, source classification and allowed object.
2. Verify payload is an explicitly authorized synthetic canary or separately approved client-free nonproduction data.
3. Encrypt inside a privileged backend with a named Vault reference; do not return the key or decrypted secret to LLM, request/response logs, GitHub, Drive or other receipt stores.
4. Upload encrypted bytes to exact approved Drive parent create-only with versioned name; store checksum and generated file ID.
5. From an **independent** cloud restore executor, download those same bytes using a separately authenticated reader and compare SHA-256. Recover plaintext only inside authorized backend; release only PASS/FAIL and checksum receipt to orchestrator.
6. Reject changed ciphertext, duplicate ID collision, size/hash mismatch, ambiguous storage identity, stale lease, missing key reference or unsafe recipient.
7. Validate independent operator/provider account access and service identities. No automatic customer data enrollment or production cutoff.

## Root encryption key portability

Supabase documents that in-place restores and provider-managed Restore-to-new-project / Branching preserve or copy Vault root keys, but manual logical `pg_dump/pg_restore` does not. Its Management API `/v1/projects/{ref}/pgsodium` can read/write a project's **64-character plaintext root key**. DO NOT call GET through a model-visible connector or write plaintext to logs, chat, Drive, Git, or file artifacts. A secure provider-native, write-only migration path is required.

A true live disaster portability test needs one specifically approved isolated clone/branch with cost review, all restored automation/cron/webhooks accounted for, restricted admin recovery, then a decrypt check in the replacement project. **This test has NOT occurred**. Avoid indiscriminate root-key rotation because legacy encrypted data can become unreadable.

Source: https://supabase.com/docs/guides/database/vault ; https://supabase.com/docs/guides/platform/clone-project ; https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

## Release gating

- [x] Staging Vault synthetic key referenced and used for encrypt/decrypt without key disclosure.
- [x] Encrypted synthetic object uploaded create-only to approved Drive folder.
- [x] Independent non-Dell Google Drive download and SHA-256 verification.
- [x] Separate cloud-side decryption Boolean PASS and tamper rejection.
- [ ] Existing X1 Railway preview has verified scoped Drive provider credential (no production or blanket scope).
- [ ] One full synthetic canary via X1 queue/provider bridge with separately operated validator.
- [ ] Root-key portability on a **different** approved isolated project.
- [ ] Privileged identity/access recovery without relying on the Dell.
- [ ] Real eligible business-data backup and independent restore with retention/RPO/RTO agreed.

Protected gates: account/permission changes, root key GET/PUT/migration, secret reference mutation, paid clone, production schema/deploy, customer messaging, deletion, and new schedulers. No such changes were performed.

Rollback: this addition is **documentation only** in an open draft PR. Existing runtime, credentials and jobs are unchanged.
