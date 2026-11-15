# Disabled staging coding dispatcher

changed_contracts: [CodingDispatchConfig, BoundCodingReview]
affected_repositories: [Strategic-Minds-AI/x1-ai-hub-swarm-runtime]
base_source_sha: c069f1036d5db95991a12a1a13deef90cb3c8507

The injectable handler prepares one proposal and independently reviews it inside the existing worker's authorization and ledger boundary. It defaults disabled, rejects production, checks tenant/worker/task/lease before and after asynchronous work, and requires a reviewer different from the builder plus a hash of the exact proposed file contents. Results explicitly declare dryRun, codeWritten=false and deployed=false.

The trusted verification transport must authenticate the configured reviewer. A reviewer ID or authorization receipt string alone is not authentication. Durable receipt storage remains an injected dependency. No provider, secret, scheduler, live worker entrypoint, queue status, source branch or deployment configuration is changed here.

Activation remains BLOCKED until scoped executor credentials and spend controls, authenticated independent QA, durable proposal evidence, worker routing, and real coding-to-preview validation are available. This proposal-only handler does not claim a website was built. Lease renewal and remote fencing are not implemented; long jobs must not use it. Failures append evidence and throw instead of returning a successful handler result. A future queue route must classify security failures as BLOCKED without replaying mutations.

Validation: full npm test plus independent GitHub CI required. Production and preview preserve their current deployments and rollback paths.
