# Governed Worker Loop

WorkPacket: `WP-20260924-X1-WORKER-BRIDGE`

The swarm runtime now has a deterministic worker path:

`lease durable work -> request mandatory authorization from Control Plane -> verify signed authorization -> claim durable execution -> run handler -> persist execution result -> finish queue item`

A blocked capability authorization never reaches the task handler and finishes the queue item as `BLOCKED`, preserving retry budget for transient runtime failures.

The worker receives no hard-coded credentials. Supabase service credentials, the internal Control Plane token, and the bootstrap signing key remain runtime-injected values.

The actual specialist/tool handler remains injectable. MCP/tool routing is the next integration layer.
