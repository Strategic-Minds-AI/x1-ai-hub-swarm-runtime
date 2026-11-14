# Eden Factory one-task X1 coding activation: scoped owner approval packet

Status: SOURCE ONLY / DRAFT / DO NOT EXECUTE WITHOUT EXACT OWNER + PROVIDER APPROVAL.
Prepared November 14, 2026. Additional allowed spend: USD $0.
Canonical mission: EDEN-UNIVERSAL-MCP-FACTORY-20261114; X1 task 6af85d83260d1c3834a8cf1a.
Rollback: revoke the exact capability, restore the old worker class list and old pinned preview deployment, preserve audit evidence.

## Verified existing infrastructure

X1 AI Hub Staging Supabase project uvdkzsbjackpjvpoxtyk, tenant 666f23bf-61bd-4be0-b5cb-4872e04fad9b.
Worker x1-swarm-preview-1: preview identity, Railway execution plane, credential BOUND, currently READ_ONLY, fresh heartbeat. X1 controller worker-fabric-controller-v1, epoch controller-convergence-20261003-v1. Lease guard is enabled.
Current worker action classes: READ_ONLY only.
Current capabilities: agent:smai:07-qa, agent:smai:09-heartbeat, agent:smai:13-digital-dominance, connector:supabase.
The existing queue x1_work_queue, x1_task_leases, x1_execution_ledger and x1_audit_receipts have RLS enabled.
Existing x1_lease_next_work and x1_lease_work_by_id take provider-side row locks. Existing x1_finish_work and x1_complete_execution have completion receipt/active lease checks; these still require live negative tests.
Current live Railway service x1-swarm-preview is pinned at GitHub source dd186b7de199f05998e5c69a41d8af1547e28eb2 and does NOT contain this new Eden Factory canary route.
The distinct Railway worker-sandbox-code belongs to an obsolete Base44 polling loop; it is not the correct executor.
Current checked X1 state: zero pending NON_PRODUCTION_MUTATION tasks, zero active execution leases.
The existing branch-only X1 dispatch and signed GitHub writer are in draft PR #12, https://github.com/Strategic-Minds-AI/x1-ai-hub-swarm-runtime/pull/12. This packet is attached to that same branch.
New canary source has branch CI PASS but is not deployed and has no independently signed Guardian verdict.

## Exact one-task canary allowance to request

Worker: x1-swarm-preview-1
Tenant: 666f23bf-61bd-4be0-b5cb-4872e04fad9b
Action: NON_PRODUCTION_MUTATION; single use, isolated staging only
Capability ID: x1:eden-factory-canary:v1
Mission: EDEN-UNIVERSAL-MCP-FACTORY-20261114
Task: eden.factory.canary.20261114
Pinned source SHA: 72b0b78afa6ebf0dc6693683ee0a9a20d618baa9
Idempotency key: 7ab67b1524eb880c2bc3437c9350dadb756a002d1f45a3dea0b19d56737f7a6a
GitHub repo: Strategic-Minds-AI/eden-universal-mcp-factory
Target branch: feature/eden-autocode-reconciler-20261114
Single writable path: tests/x1-worker-canary.test.mjs
Permitted test: node --test tests/x1-worker-canary.test.mjs
Attempt budget: 1; cost limit: $0; synthetic only, no customer content, no outbound, no other provider mutations.
Feature flag: X1_EDEN_FACTORY_CANARY_ENABLED=false by default.

## Current versus proposed worker permission

CURRENT classes: [READ_ONLY]
PROPOSED classes: [READ_ONLY, NON_PRODUCTION_MUTATION] only AFTER independent hard-gate proofs.
CURRENT capabilities: [agent:smai:07-qa, agent:smai:09-heartbeat, agent:smai:13-digital-dominance, connector:supabase]
PROPOSED capabilities: prior list plus [x1:eden-factory-canary:v1].

CRITICAL: NEVER execute an unconditional class-list expansion. That alone could admit unrelated jobs.
Before updating the worker registry or deployed feature gate, modify and independently test both provider-side X1 lease-admission functions. They must atomically refuse every NON_PRODUCTION_MUTATION for this worker except the ONE exact tenant + worker + mission + task + repo + branch + SHA + idempotency + path + capability + retry budget tuple listed above, and must refuse an expired, replaced, cross-tenant or already-consumed lease at the write boundary.
Do not invent a fencing-token column. The database currently provides lease ID/ownership and row-level transactional constraints; actual compare-and-swap must be verified at the protected writer, not by trusting packet claims.

## Required BEFORE applying the protected changes

1. Build a disabled handler for EDEN_FACTORY_CANARY_V1 in an unwatched X1 runtime feature branch, retaining current deployed source and service unchanged.
2. Verify approved existing isolated sandbox with restricted egress, CPU/memory/time limits and no inherited production, GitHub or Supabase credentials in untrusted code.
3. Verify signed short-lived authorization from the actual X1 controller and a distinct provider-side branch-write grant. GitHub commit must be compare-and-swap against the exact expected source SHA.
4. Verify the existing independently authenticated QA endpoint, cost allowance and kill switch. A reviewer name or signed builder claim is not independent certification.
5. Implement and run negative tests for cross-tenant, wrong worker/repo/branch/path/SHA, altered signature, unauthorized action class, stale/replaced lease, concurrent workers, replay/idempotency, lost ACK, errors after GitHub commit, rollback and expired admission.
6. Only then request owner consent for the exact staging-only registry/lease-function scope and preview worker deployment. Never mutate production, main branch, secrets, DNS or paid inference.

## After owner approval

Provider executes the exact reviewed one-time admission and disabled-by-default handler cutover with separate credentials, records before/after registry and SQL function digest, and only then launches one synthetic task through the existing X1 queue.
Worker must produce real provider ACK, GitHub commit, Node test and durable completion receipt.
Verify 3 actual existing-scheduler cycles and restart recovery. Require independent QA, Apex and Guardian at the exact new source SHA before PR merges or release.

## Kill switch and rollback

Disable X1_EDEN_FACTORY_CANARY_ENABLED. Reject future admission of the one-task capability. Invalidate the single-use grant. Restore exactly [READ_ONLY] and the original capabilities on x1-swarm-preview-1. Restore the previously pinned Railway preview deployment only after scoped approval. Verify the old worker state, queue leases and no tenant/production changes via provider readback.

No changes to protected permissions, provider secrets, DNS, billing, live Railway deployment, main, or scheduler are authorized by this documentation alone.
