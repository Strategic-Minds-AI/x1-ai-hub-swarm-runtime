# Preview Worker Service

This branch includes a minimal runnable preview worker.

- Polls the durable staging queue.
- Requests mandatory authorization from the Control Plane before every task.
- Uses the durable Supabase execution ledger.
- Exposes `GET /healthz`.
- Executes only `READ_ONLY` preview acknowledgements in this service.
- Rejects mutation handlers until a separately governed specialist/MCP dispatcher is installed.

Runtime configuration is environment-only. No secret values are committed.
