# Super Agent Lanes

This runtime supports eight deterministic Super Agent lanes on the same X1 queue/lease/execution kernel.

Lanes:
- orchestrator
- growth_operator
- code_architect
- social_strategist
- sales_engine
- brand_guardian
- replicator
- swarm

## Routing

Existing workers continue to call `x1_lease_next_work`.

Workers with `X1_AGENT_LANE` configured call `x1_lease_next_work_for_lane` and only lease work whose payload contains an exact matching `agent_lane`.

Example work payload:

```json
{
  "agent_lane": "code_architect",
  "mission": "analyze repository",
  "dry_run": true
}
```

This prevents eight persistent lane workers from racing for generic X1 work.

## Local Docker

Copy `.env.super-agents.example` to `.env.runtime` outside source control and provide the existing X1 staging runtime credentials.

Then:

```bash
docker compose -f docker-compose.super-agents.yml build
docker compose -f docker-compose.super-agents.yml up -d
```

Health endpoints:
- orchestrator: http://localhost:3101/healthz
- growth: http://localhost:3102/healthz
- code: http://localhost:3103/healthz
- social: http://localhost:3104/healthz
- sales: http://localhost:3105/healthz
- brand: http://localhost:3106/healthz
- replicator: http://localhost:3107/healthz
- swarm: http://localhost:3108/healthz

## Release gate

Do not start lane workers until `x1_lease_next_work_for_lane` exists in the selected Supabase environment. The client fails closed when the lane RPC is unavailable.

Do not enable production mutations without the existing approval, validation-receipt and rollback gates.
