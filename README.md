# x1-ai-hub-swarm-runtime

**Strategic Minds AI — X1 AI Hub OS**

> **Role**: Railway-oriented swarm runtime for leased tasks, ephemeral agents, budgets, retries, dead letters and worker health.

---

## Authority
Execution runtime for multi-agent swarm tasks. Manages agent worker lifecycles, task leases, budget guardrails, retries, and dead-letter queues.

Canonical repository: `Strategic-Minds-AI/x1-ai-hub-swarm-runtime`  
Default branch: `main`  
Bootstrap branch: `bootstrap/x1-ai-hub-os-v1`  
Production release status: **LOCKED** (`production_release: LOCKED`)  
Visibility: **PRIVATE**

---

## Responsibilities
- Poll and execute leased work packets dispatched by x1-ai-hub-control-plane.
- Manage ephemeral agent worker pools on Railway container environments.
- Enforce task execution timeout budgets, token limits, and exponential backoff retries.
- Route irrecoverable task failures to dead-letter storage and publish health metrics.

---

## Non-Responsibilities
- Control plane reconciliation loop scheduling (owned by x1-ai-hub-control-plane).
- Static tool metadata cataloging (owned by x1-ai-hub-catalog).
- Client web application hosting (owned by x1-ai-hub).

---

## Upstream and Downstream Interfaces

### Upstream Interfaces
- x1-ai-hub-control-plane (polls leased tasks and returns execution results)
- x1-ai-hub-protocol (WorkPacket schemas)

### Downstream Interfaces
- x1-ai-hub-mcp-gateway (invokes tools via MCP gateway)
- x1-ai-hub-memory (persists and retrieves agent execution context)
- x1-ai-hub-sandbox (executes sandboxed code snippets)

---

## Local Development
Prerequisites: Node.js >= 18 or Python 3.11+, Docker.
Commands:
```bash
npm install
npm run swarm:dev # Runs worker polling loop locally
```

---

## Tests
Worker leasing and task execution unit tests (`npm test`). Dead-letter queue recovery and network fault injection tests (`npm run test:faults`).

---

## Validation Gates
- 100% compliance on SIGTERM graceful shutdown handling.
- Zero duplicate task execution under concurrent worker lease competition.
- Typecheck and ESLint checks must pass clean.
- CI pipeline gate (`.github/workflows/x1-bootstrap-ci.yml`) must pass.

---

## Security
Worker processes execute under unprivileged container accounts (UID 10001). Dynamic, short-lived token injection for cloud services. All secrets scrubbed from worker memory post-task completion.

---

## Deployment
Deployed as background worker service on Railway container platform with automated horizontal pod autoscaling.

---

## Rollback
Railway release rollback to prior container image tag (`railway rollback`). Automatic task lease release ensures uncompleted tasks are safely retried by prior runtime version.

---

## Receipts
Emits `SwarmTaskReceipt` artifacts signed with worker node ID, duration, token burn count, and completion state.

---

## Ownership and Handoff
- **Owner**: Strategic Minds AI - Swarm Runtime & Distributed Systems Team (`Strategic-Minds-AI`)
- **Handoff Contract**: Owned by Strategic Minds AI - Swarm Runtime & Distributed Systems Team (`Strategic-Minds-AI`). Handoff requires worker telemetry verification, fault-injection test pass receipt, and operator signoff.
- **Operating Contract**: All modifications belong to `bootstrap/x1-ai-hub-os-v1` branch until approved by the operator. Changes to machine contracts require dependency impact analysis, counterpart interface updates, and fresh `VERIFIED_100` evidence verification.
