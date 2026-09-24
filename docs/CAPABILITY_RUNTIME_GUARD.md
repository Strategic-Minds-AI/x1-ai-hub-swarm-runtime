# Capability Runtime Guard

WorkPacket: `WP-20260924-MANDATORY-CAPABILITY-BOOTSTRAP`

## Structural rule
`executeAuthorizedTask()` requires a valid bootstrap authorization, execution context, task lease, signing key, execution ledger, and handler. There is no supported unguarded execution entrypoint in this packet.

The runtime rejects absent, blocked, expired, context-mismatched, tampered, or unsupported-signature authorizations before invoking the task handler.

## Lease and duplicate execution
The lease must match task and agent context and must be unexpired. The execution ledger rejects concurrent or completed duplicate execution. Failed work may be retried only under a different lease ID.

`InMemoryExecutionLedger` is a development/test adapter. Durable production execution must replace it with a transactional persistent ledger while preserving the same interface and semantics.

## Validation
Local tests cover expired authorization, runtime bypass, cross-tenant authorization, duplicate task execution, tampered signature, and lease-holder mismatch.
