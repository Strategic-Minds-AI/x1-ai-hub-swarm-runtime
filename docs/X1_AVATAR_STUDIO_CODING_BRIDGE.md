# X1 | First coding-agent bridge in existing swarm runtime
## Purpose
Add the first safe code-agent task definition to the existing Railway X1 worker contract **without activating a second supervisor or new paid agent**.

## Implementation
`src/coding-agent-contract.ts`: typed, fail-closed normalized work packet for exactly `Strategic-Minds-AI/X1-OPERATING-SYSTEM` branch-only coding. Strict action class `NON_PRODUCTION_MUTATION`, deterministic SHA/idempotency, a limited source file namespace, explicit acceptance checks, dry-run=true, independent validator=true and protected actions denied.
`tests/coding-agent-contract.test.mjs`: checks valid normalized packet and blocks production, main, other repo, traversal/workflow path and spending flags. Existing runtime remains unmodified and worker still handles read-only ACKs.

## Integration NOT YET DONE
For safe autonomous software work, a new authorized harness adapter (provider-agnostic Codex/sandbox) must be registered *inside* existing `processNextWork` handler with a verified gateway and hard-bound workspace. The control-plane must validate signed mandatory capability authorizations, lease state, repo permissions, per-task budgets and tenant. The coding harness should run in isolated sandbox, produce feature-branch commit + DRAFT PR, and route to independent QA. No production changes, secrets, spend or customer traffic without operator approval.
Do NOT switch on with an env flag until a deterministic READ_ONLY and NON_PRODUCTION_MUTATION canary pass, independent validation and rollback. Default worker behavior remains read-only.

## Real current state
Worker source inspected: `worker-main.ts` handler explicitly rejects any work with action_class other than READ_ONLY. Therefore it is FALSE to claim autonomous coding is presently active. This PR adds tested normalization and a governed engineering contract only.
