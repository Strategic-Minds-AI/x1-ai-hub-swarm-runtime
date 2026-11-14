# X1 persistent autonomy: compatibility audit and safe integration candidate

Date: 2026-10-11. Status: LOCAL VALIDATION PASS; LIVE CODING ACTIVATION BLOCKED.

## Result
Reuse the existing X1 supervisor, Supabase durable queue, leases, execution ledger and audit receipts. Add a bounded, isolated coding executor behind that queue. Use Codex noninteractive execution or the existing Vercel AI Gateway proposal adapter after runtime/auth/budget verification. OpenClaw is an optional executor adapter, not a replacement supervisor. No uploaded Base44 heartbeat or local worker was started. No production, credentials, scheduler, payments or customer communications changed by this audit.

## Verified evidence
- All seven supplied ZIPs inventoried and SHA-256 hashed; originals unchanged.
- Railway preview service b9c79ead-1edc-44b9-9823-98d37b20399e remains at successful deployment 175fc337-1f9f-4401-add6-c1ae6c440d4b, source 731daa5688b36b34e31d998c8687a9bbf145bbbf. The current describe-service read had no staged changes.
- Earlier independent no-spend canary 6c2002e2-f1d0-4b63-905a-a7bf421ea6f5 proved one completed queue/lease/ledger/receipt with matching tenant/task/lease bindings and authoritative receipt hash. This is READ_ONLY acknowledgment, not code generation.
- PR #9 is open, draft and disabled: source 54c4072ae5d7b0b055e5fcba28f53f618f8ea719. PR #8 is open, draft and unactivated: source f8243fc5ddb04680baa5babe046ed39001c7f80d.
- Isolated combined candidate uses the deployed hardening source as base and adds the coding and sandbox modules from those exact SHAs. Added the two sandbox exports from PR #8 without replacing existing exports. This is source assembly, not runtime dispatch integration.
- Combined npm test (typecheck + build + Node tests): initially 114 PASS after assembling exports. Adversarial probe exposed string-valued false review decisions being accepted. Patch rejects nonboolean decisions, nonboolean check results, malformed/empty check evidence and duplicate check names. Final local suite: 116 PASS, 0 FAIL. No model or external provider execution in tests. Local tests are not independent release certification.

## Package findings
| Area | Finding | Integration decision |
|---|---|---|
| Five packs and SEAL bundle | Primarily Markdown, schemas, role definitions and an explicitly pseudocode MCP server | Import as requirements/contracts; do not advertise as callable deployed tools |
| Base44 task claim | runAgentLoop reads pending tasks and later updates status; heartbeat rereads then updates; no atomic compare-and-set claim shown | Route reusable capabilities through X1 atomic queue; never run both claimers |
| Recovery | resilience.ts resets old in_progress tasks to pending without execution-ledger fencing | Exclude; preserve X1 uncertain-execution blocking |
| Timeout | Promise.race times out while underlying operation can continue; timer not cancelled | Require abortable IO and quarantine uncertain side effects |
| Authorization | runAgentLoop permits any authenticated user then uses service-role entity access; no per-task tenant/admin decision in that entry point | Require X1 tenant/task/lease-bound control-plane authorization |
| Protected effects | buy_domain calls buy:true; email/video actions exist; websiteDeployment sends target:production | Keep outside automatic safe-action dispatcher; scoped approval required |
| Legacy local worker | In-process single flight exists; fetch has no deadline; SIGTERM exits immediately; separate heartbeat | Do not start; retain current X1 supervisor and graceful drain |
| Coding review | Baseline checks claimed independence by reviewer name and base SHA, with no authenticated builder identity or candidate content-hash binding | Activation blocked pending independently bound candidate certification |
| Budget | Gateway adapter has token caps and enable/receipt strings, but no durable provider-dollar reservation or settlement | No paid calls until scoped budget and durable accounting |
| Coding target | PR #9 allowlists only Strategic-Minds-AI/X1-OPERATING-SYSTEM | Do not broaden repository scope implicitly |

## Safe work that can proceed now
1. Keep the working preview worker and rollback reference stable.
2. Review the isolated combined branch, independently run CI, and repair deterministic contract/test failures.
3. Resolve authoritative upstream protocol and source-truth constitution; current repository has only its local Swarm Constitution and references to upstream contracts. Upstream parity remains UNKNOWN.
4. Finish fail-closed candidate verification, dependency boundaries, read-only provider inventory, and draft execution packets.
5. Build one synthetic coding vertical slice with a fake proposer/no external actions; record every transition. This only tests orchestration, not model quality.
6. Prepare real executor behind a disabled flag and explicitly bound repository, paths, command allowlist, runtime identity and budgets.

## End-to-end target contract
Mission -> signed scoped packet -> atomic lease -> isolated source checkout -> code proposal/patch -> artifact hash -> independent CI/security/visual/operational validation -> bounded repair -> immutable preview -> durable receipt -> archive/checkpoint -> resume/recovery. Protected release remains separately approved.

## Builder specifications and acceptance gates
- Frontend: preserve approved application; expose actual job state, receipt links and unknown/blocked reasons. No redesign or fake autonomy counters.
- Backend/API: only signed packet actions; handler registry disabled unless provider binding is verified; enforce deny-by-default action classes and tenants.
- Data/RLS: use existing staging queue, ledger, receipts and sandbox registry. No new queue or production schema. Atomic claim, unique idempotency keys, fencing tokens and explicit lease renewal for long jobs.
- Workflow: one supervisor; durable dependencies/checkpoints; one execution per attempt; bounded repair <=3; ambiguous completion blocks replay.
- Model routing: Codex or Vercel Gateway adapter; durable reservation of token/dollar limits before dispatch; settle actual usage; exhausted budget blocks. Never give model deployment credentials.
- Providers: GitHub branch-only writer, Vercel preview-only publisher, Supabase staging registry, Railway existing worker. Verify IDs, ownership and credentials by reference; no credential values in receipts.
- Vercel cron/workflow: reconcile existing scheduler identity; do not add another cron. Existing 5-minute reconcile ownership is UNKNOWN until read-back and duplicate checks.
- Railway: retain x1-swarm-preview, pinned source and 35-second drain; isolated executor must not inherit supervisor service-role credentials.
- Local Docker: optional sandbox only, unprivileged, no Docker socket, no host credentials, writable job workspace only; resource/time/network caps. Host availability and installed Codex are UNKNOWN.
- GitHub: new unwatched draft branch from immutable preview source; no main/protected merge; CI validation must bind exact candidate SHA and required workflow evidence.
- DNS/domains: excluded from automatic branch/preview actions; no purchase or DNS effect allowed.
- Smoke: one synthetic edit -> build/typecheck/tests -> verified artifact -> preview -> receipt, with no customer data. A fake proposer is not a real coding canary.
- Independent QA: authenticated builder and reviewer identities must differ; certify candidate hash, not merely input SHA; all required check booleans strictly validated. Candidate cannot edit its validator, policy or provider credentials.
- Rollback: preserve previous preview deployment 2f067649-c275-43a8-a13b-505bcd9c08f1 / source c9371658a47924f309b6c125e480dd444ea17bd0. Provider previously reports rollback capability; actual restore drill remains UNKNOWN. Disable new handler before any revert.
- Environment checklist: names/references only; executor authentication, budget approval, scoped repository-write grant, sandbox binding, validator identity, archive destination, kill switch. No secrets created or changed.

## Required fault tests before persistent coding activation
Duplicate delivery and concurrent lease competition; crashed handler; SIGTERM during job; provider timeout after commit; lost ACK; lease expiration and renewal; expired fencing token; tenant mismatch; repo/path traversal; manipulated validation evidence; edited validator/policy; budget exhaustion; secret leakage; restart/checkpoint resume; archive failure; unavailable provider; kill switch; rollback read-back. Run restart/resume and sustained observation on actual infrastructure before claiming 24/7.

## Autonomy boundary
Automatically eligible after tested binding: research, plans, allowlisted branch edits, isolated tests, independent validation, bounded repair and preview artifacts within approved quotas. Block production/default merges, production DB/RLS, DNS, secrets/permissions, purchases, new spend and live outbound pending scoped approval. A chat plugin is a command interface; external runtime owns persistence when chat closes. No blanket activation or budget approval was inferred from the request.

## OpenClaw versus Codex
Recommendation (engineering inference): Codex as an X1 executor has the smallest integration surface because the persistent queue already works. OpenClaw can run sandboxed tools but would need the same job, lease, identity, budget, validation and receipt adapter. Adding its independent heartbeat would duplicate orchestration. Do not use unrestricted/elevated host execution. No OpenClaw or Codex installation was performed.

Official sources: https://developers.openai.com/codex/noninteractive ; https://docs.openclaw.ai/gateway/security/tool-permissions ; https://docs.openclaw.ai/gateway/config-agents/sandbox .
Repository evidence: https://github.com/Strategic-Minds-AI/x1-ai-hub-swarm-runtime/pull/7 ; /pull/8 ; /pull/9 .

## Handoff
VERIFIED: package hashes, source assembly, current preview identity, existing read-only canary, 116 local tests and targeted review-type repair.
INFERRED: extending existing X1 is less disruptive than adding a second supervisor.
COULD NOT VERIFY: live coding, installed executor/auth, singleton supervisor/scheduler, authenticated validator identity, provider budgets, restart/resume, rollback restore and continuous uptime.
BLOCKERS: these live binding/evidence gates; there is no basis to call the entire pipeline complete.
WORKAROUND: isolated disabled integration candidate and existing read-only worker.
NEXT: independent CI review of candidate; bind executor and test one real bounded staging coding job before activation. No paid/job activation is authorized by this document.

## Contract impact
changed_contracts: coding.review.strict-types-and-unique-checks; sandbox.public-module-exports; draft persistent-autonomy acceptance requirements.
affected_repositories: Strategic-Minds-AI/x1-ai-hub-swarm-runtime only. No upstream protocol/repo changes deployed.
