# Digital Dominance preview adapter — 2026-10-14

Status: DEVELOPMENT CANDIDATE. Connector-mediated preview verified separately; queue-driven generation is BLOCKED, not completed.

## Exact source and execution boundaries
- Existing factory base: `XTREME-SYSTEMS/digital-dominance@c647c23331d658674eed36644cce9832833cc8cc`, PR #38.
- New adapter: `factory/preview-adapter.mjs`; canonical renderer: `factory/render-synthetic-preview.mjs`.
- Existing compiler imports the extracted renderer. Its default fixture HTML remains byte-for-byte identical: SHA256 `4bc99dd17ba8a66d562497a55fde8d58b37192bb8066c0156d1810af31e296f1`.
- One fixed fixture only: `factory/fixtures/synthetic-epoxy.json`. The worker generates HTML using the canonical renderer, adds its work identity, creates an isolated source branch, then reuses the automatic Git integration deployment of the exact Git source to existing Vercel project `prj_mgySytKyeK5i9DwnQDRGHVjyenrz` in team `team_aFdds8lsbHMwe2ip4aQdbQ3d`.
- Vercel target omitted; READY readback must show target null, native matching GitHub source SHA/ref/repository, allowed preview hostname/branch aliases, exact page+manifest bytes and dual noindex protection. Paid AI/domain/customer/indexing paths do not exist.
- `massLaunchOrchestrator` remains HTTP409 quarantined. This change does NOT make that live API operational or modify Base44.

## Existing X1 integration
Companion development branch: `Strategic-Minds-AI/x1-ai-hub-swarm-runtime`, `feature/dd-preview-adapter-20261014`. The existing worker handler imports hash-tracked copies of these two modules. The existing signed authorization guard, queue, singleton loop, lease, attempt ledger, shutdown, and generic/WLE handlers are preserved. There is no additional scheduler, service, queue or heartbeat.

New contract: `DD_SYNTHETIC_VERCEL_PREVIEW_V1`; action `NON_PRODUCTION_MUTATION`; quantity exactly 1; synthetic true; release_mode preview; indexable/customer_outbound/paid_ai false. Required signed capability: `dd-synthetic-preview-only`. Exact approved input source SHA is the factory base above. Only attempt 1 is eligible; ambiguous provider/QA outcomes require reconciliation, never blind mutation retry.

Worker prerequisites are checked BEFORE any provider write:
- Preview runtime and tenant/holder/task/valid lease identity.
- `DD_PREVIEW_ENABLED=true` and independently established `DD_PREVIEW_COMPLETION_FENCE_VERIFIED=true`.
- Existing scoped provider bindings `X1_GITHUB_PREVIEW_TOKEN`, `X1_VERCEL_PREVIEW_TOKEN`.
- Existing independent validator enabled, endpoint/token/identity bound and distinct from builder.
- A DD-aware validator must bind its persisted Guardian receipt to tenant/work/task/lease, approved and generated source SHAs, HTML hash and deployment ID, and test desktop/mobile calculator, synthetic API, errors, source/noindex.

## Verified live preview, connector execution only
- Source commit: `d401fb0db889eca4ac3c20b16c1444f345a09ca2`.
- Branch: `feature/dd-preview-be07c310-7878-45ba-88a9-752164c8f712`.
- Deployment: `dpl_14C7DEeK52TicCRwjECaSQUdddi4`, READY, target null.
- Page: https://digital-dominance-efnmoptp3-strategic-minds-advisory.vercel.app/factory-jobs/be07c310-7878-45ba-88a9-752164c8f712/
- HTML SHA256: `50e5fffcfe76bec5619b9a0fc777617ef263b995c5b2e0a85bd8345ac184494f`.
- The artifact UUID names the connector-built artifact; it is NOT a queue/lease execution receipt. No new X1 mutating work item has been submitted or completed.
- Native Vercel connector readback exposes GitHub source metadata; its normalized response omits custom metadata. Source SHA/ref and live byte/manifest checks remain mandatory.

## Current operational blockers
1. Railway existing worker `b9c79ead-1edc-44b9-9823-98d37b20399e`, project `f442cf0a-7275-4c2b-bf73-2dda4254e002`, deployed source `dd186b7de199f05998e5c69a41d8af1547e28eb2`, has no provider-token or QA endpoint/token/validator-ID bindings in its variable inventory. No secrets changed.
2. Live `x1_complete_execution` QA fence recognizes ONLY `X1_PROMPT_TO_VERCEL_PREVIEW_V1` and hashes supplied HTML. It does not yet independently fence the new DD kind or its worker-rendered hash. Leave the DD fence flag unset until exact staging DB contract and negative tests establish coverage. No DB/RLS change applied.
3. Exact scoped DD capability registration/authorization and the existing validator's DD request support are unverified. No permission changes made.
4. Worker code remains a development branch, not a deployed worker release. Canonical protocol repo currently contains README only; global source-truth Constitution was not located in the checked source. These are governance-source gaps, not invented evidence.

## Rollback and next execution
Discard/revert the two development branches to their recorded parents. Existing preview URLs and main/production remain intact; no automatic rollback or deletion is attempted. Keep the one connector-built preview as immutable evidence.

Bind preexisting scoped credentials/validator references through the authorized custody workflow, establish the exact DD staging completion fence, deploy the tested change into the SAME preview worker, submit ONE authenticated signed DD work item through existing `x1_enqueue_work`, and independently read its queue/lease/deployment/Guardian/database receipts. Only then permit a small batch. This turn does not expand the batch because the complete queue-driven execution has not passed.

Changed contracts: `DD_SYNTHETIC_VERCEL_PREVIEW_V1`, renderer extraction API, worker signed scope and blocked reconciliation handling.
Affected repositories: `XTREME-SYSTEMS/digital-dominance`, `Strategic-Minds-AI/x1-ai-hub-swarm-runtime`.

## Duplicate build repair
Provider list revealed two READY previews for the single artifact source: automatic Git deployment `dpl_GHByH8kTksKQeT869rJ7x5PBL2s6` and explicit connector deployment `dpl_14C7DEeK52TicCRwjECaSQUdddi4`. Both are preview targets. The adapter now polls the existing Git integration and REUSES the oldest matching source/branch preview; it NEVER requests a second deployment POST. If none is observed within a bounded poll it blocks for reconciliation. Neither existing preview is deleted.

## Validation gates
- Factory default renderer: original exact SHA256 preserved; 200-artifact deterministic batch compiler and verifier PASS. Offline output remains unpublished.
- DD adapter tests: 7/7 PASS, including production/identity/lease/paid-AI/payload/source denial, dual noindex, manifest/byte drift, and GET-only reuse of existing Git deployment. Changed-file ESLint PASS.
- X1 runtime: typecheck/build and 151/151 tests PASS, including all prior generic and WLE flows. New missing-binding checks fail before any network write.
- Full DD application build PASS with existing large-bundle/CSS warning. Full DD lint FAIL (465 unused-import errors in untouched application source); full DD typecheck FAIL (1641 errors in untouched application source). No application-wide PASS or release readiness is claimed.
- JARVIS existing headless Chrome tested 1440x900, 820x1180,390x844: page200, header/meta noindex, 31x22=682, zero invalid-dimensions state, synthetic API receipt, zero overflow/page exceptions at all three sizes; exit0. Native screenshots and receipt retained in existing QA toolkit with dd-preview-20261014 filenames. Independent validator separately refetches source and live bytes; persisted signed/database Guardian PASS is not observed.
- All paid AI generation avoided; AI Gateway current credit/balance UNKNOWN and not required by this deterministic path.

Independent validation receipt: `independent-validation-receipt.json`. Independent source/live HTTP/cloud-browser checks and independent JARVIS script/receipt readback confirm preview functional PASS; overall pipeline PARTIAL because queue-generated deployment and durable Guardian/database validation are not observed.
