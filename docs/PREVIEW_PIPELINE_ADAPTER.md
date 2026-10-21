# X1 preview pipeline adapter

Status: committed on `feat/preview-pipeline-adapter-20261021`, draft PR #20. Not deployed, not enabled.

## What it is
The `NON_PRODUCTION_MUTATION` handler the preview worker was missing, wired into the EXISTING dispatch path in
`src/worker-main-gateway.ts`. READ_ONLY work keeps its original acknowledgement; `NON_PRODUCTION_MUTATION` work goes
through the adapter; anything else is still refused with `NO_HANDLER_FOR_ACTION_CLASS`. Nothing about the queue,
the lease, the authorization handshake or the ledger changed.

## Gates, in the order they run
1. Feature gate: preview runtime, `X1_PREVIEW_ENABLED=true`, `NON_PRODUCTION_MUTATION`, system tenant, noindex payload, preview target.
2. Database fence: staging ref required, production ref refused wherever it appears in the payload.
3. Build manifest: the launch engine's `strategic-minds/sitepack-build-manifest/v1` shape, a 40-hex source SHA equal to the
   work item and to the running worker, a 64-hex sha256 `artifact_digest` (never a 40-hex commit id in its place), a per-file
   sha256 and byte count for every emitted file, and every required gate recorded.
4. Receipt readback: the QA and Guardian receipts are read from the ledger by an authenticated gateway call
   (`x1_read_task_receipts`) on the work item's tenant and task. The handler takes the work item and nothing else, so no
   caller can supply a receipt.
5. Independent QA receipt: present, `decision: PASS`, not issued by the worker, the requester or a builder identity, and
   bound to the same task, tenant, artifact digest and source SHA.
6. Guardian receipt: present, `independent_validation`, `decision: PASS`, issued by a `guardian-*` or `vision-cortex-*`
   identity whose payload identity equals its issuer row, carrying `validator_credential_class: VALIDATOR`, and bound to the
   same task, tenant, artifact digest and source SHA.
7. Deployment evidence: `PREVIEW_READY` is reported only when a deployment reports the artifact digest and its URL answers
   `200` on a host inside `X1_PREVIEW_HOST_ALLOWLIST`. Without an allowlist, without a deployer, with a mismatched digest,
   an unreachable URL or a non-200 answer the result stays `PREPARED_NOT_DEPLOYED` with `preview_url: null`.

## Fail-closed defaults
`X1_PREVIEW_ENABLED`, `X1_PREVIEW_DEPLOY_AUTHORIZED` and `X1_PREVIEW_HOST_ALLOWLIST` are all off or empty unless set. No
staging deployer is wired, so this adapter can prepare an artifact but cannot reach `PREVIEW_READY` until an authorized
deployer is added and a host allowlist is configured. A readback fault is `PREVIEW_READBACK_FAILED` and produces no artifact.

## Cross-repository contract
`contracts/PREVIEW_PIPELINE_CONTRACT.json` (with its sha256 beside it) is carried byte-identically by this repository,
`x1-launch-engine` and `x1-ai-hub-control-plane`. `tests/cross-repo-contract.test.mjs` asserts the digest, the manifest
key set and gates, the refusal vocabulary and the exact receipt shape the control plane writes, so a divergence fails in CI
rather than in production.

## Still missing before a live preview
An authorized staging deployer and its host allowlist, `X1_STAGING_SUPABASE_REF`/`X1_PRODUCTION_SUPABASE_REF`,
a real launch engine manifest on the pinned SHA, an independent QA receipt, and a control plane `independent_validation`
receipt bound to that manifest digest.
