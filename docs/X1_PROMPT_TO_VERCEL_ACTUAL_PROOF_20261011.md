# X1 prompt -> real code -> GitHub -> Vercel Preview | 2026-10-11

## Mission
Operator demanded one natural-language ChatGPT command OR X1 admin command to generate a genuinely working website, verify it and return a clickable finished Vercel URL. Do not require the operator to repeat identity setup already handled elsewhere.

## Real artifact delivered through existing ChatGPT provider connections
- Command context: an X1 proof canary based on the previously approved premium Instant Estimate direction. ChatGPT authored a **new, functional and responsive** synthetic flooring website (not a mockup, not a BUILD_PACKET.json).
- Site: https://website-launch-engine-aqtt9t09p-strategic-minds-advisory.vercel.app/
- GitHub source: https://github.com/Strategic-Minds-AI/X1-OPERATING-SYSTEMS/commit/acca358bfcbae1815f6ca726dffb786e97516220
- Source branch: `feature/x1-output-574b7d3c-26f0-4607-96ac-2da1fa21cd99`
- Source file: `generated-previews/574b7d3c-26f0-4607-96ac-2da1fa21cd99/index.html` (21,422 UTF-8 characters).
- Verified source HTML sha256: `92728c0cb29cbcefaec3af5ba190fe1c143b694e32abac8e49847903fff67946`.
- Actual Vercel Preview deployment: `dpl_4gAZtfWvXJEckwLtExGeGbqhhyFS`, state READY, `target=null` (preview), zero production aliases. Existing Website Launch Engine Vercel team and project reused. No DNS/payment/production release/customer messages.
- Browsers: existing Xtreme Cloud Browser (separate 1440 and 390 contexts) and independently existing JARVIS desktop headless Chrome/CDP. No new browser backend deployed.
- JARVIS independent script: `C:\_Strategic_Minds_AI_OS\03_Bridge_Receipts\x1-prompt-proof-20261011\proof-browser.cjs`.
- Machine-readable QA: `C:\_Strategic_Minds_AI_OS\03_Bridge_Receipts\x1-prompt-proof-20261011\validation-receipt.json` and native PNG files `desktop1440x900.png`, `mobile390x844.png`.
- **14/14** independent Chrome checks passed, 0 failed: exact public GitHub source HTML equals Vercel served prefix, only exact deployment-bound Vercel toolbar suffix allowed, noindex HTTP, desktop/mobile page load, actual viewport and horizontal overflow, PNG screenshots saved, mobile nav expands, estimator calculations 1250 sq ft: metallic `$15,000–$21,000`, extensive prep `$23,250–$32,550`, invalid 15 sq ft `Check the area`; no browser exceptions.
- Xtreme Cloud Browser independent interactive desktop/mobile click checks passed; no failed network requests or JS errors observed.
- Existing X1 Supabase Staging audit ledger `x1_audit_receipts` has ONE verified record `X1-GPT-VERCEL-574b7d3c-26f0-4607-96ac-2da1fa21cd99`, receipt type `GPT_PREVIEW_BUILD_VALIDATION`. Existing `apex_output_events` output bus contains exactly ONE validated event `X1-CHATGPT-VERCEL-574b7d3c-26f0-4607-96ac-2da1fa21cd99`. No duplicate queue/supervisor.

## Existing persistent worker integration draft (THIS BRANCH)
- Repo: Strategic-Minds-AI/x1-ai-hub-swarm-runtime.
- Work branch: `feature/x1-prompt-to-vercel-preview-v1-20261011` off original operational preview worker `20ba518d7372f98ed2b7a778c5947a5b6231d5ca`.
- New `src/x1-prompt-preview.ts` accepts one immutable `LeasedWork` preview packet containing *fully authored source* and prompt, pins approved GitHub source base, validates synthetic/nonproduction/lease identity, writes a distinct GitHub branch and commit through real GitHub Git Tree APIs, creates an inline static Vercel PREVIEW and checks readiness, source hash and robots.
- Modifies ONLY existing `src/worker-main-gateway.ts` handler to allow this exact packet, disabled unless `X1_PROMPT_PREVIEW_ENABLED=true`, `X1_DB_COMPLETION_FENCING_PASS=true`, Preview runtime and existing server-only scoped provider credentials. No new queue, worker, timer, scheduler, owner identity or control plane.
- 64/64 real GitHub CI tests passed on commit `2457ebe1a05f7179500927f0126a7d2f9aedf13d`, run https://github.com/Strategic-Minds-AI/x1-ai-hub-swarm-runtime/actions/runs/38183696276.
- This runtime code currently supports a bounded *static HTML app pack*. Generic arbitrary React/Node app generation and multi-agent QA beyond this path remain out of scope. Do not overstate.

## Verification and activation boundary
**VERIFIED:** chat-triggered real GitHub commit, independent Vercel ready preview, byte-for-byte source-to-URL proof, 14/14 independent JARVIS functional QA, X1 output bus/receipt stored, 64/64 worker code CI.

**NOT VERIFIED:** a real worker-initiated GitHub/Vercel build from an X1 leased work item; active admin-/GPT-authenticated job submission into X1 queue; automatic repair loop; arbitrary full-stack app generation. User requests avoiding repeated sign-in questions; honor that without bypassing existing policy.

**BLOCKED:** X1 staging DB `public.x1_complete_execution` lacks an expired-lease fence and `public.x1_finish_work` can queue-ack COMPLETED without matching durable ledger receipt. These were demonstrated with rollback-only staging tests earlier and remain unpatched as of latest read. Enabling mutating worker before fixing risks duplicate/misattributed site provisioning. Keep the new worker handler disabled until exact staging migrations and independent negative tests are PASS. No server credentials are requested or displayed here.

**Rollback:** Existing Railway preview running `20ba518d7372f98ed2b7a778c5947a5b6231d5ca` was NOT modified. GitHub main branches and production alias untouched. Revert feature branch to original SHA, leave Vercel preview as immutable test evidence, or disable the new worker flags; no cleanup needed.

## Next
Finish the two existing X1 Staging execution-completion SQL fences with rollback and negative QA. Bind preexisting authorized worker provider credentials through already established managed references (no fresh operator login ceremony), run ONE real signed queue-lease -> worker -> GitHub commit -> Vercel preview -> independent browser QA -> exact receipt, then activate admin chat command adapter to reuse the SAME queue and receipt stream.
