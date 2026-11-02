-- Universal Worker Fabric v1
-- Independent controller guard for staging worker lease/claim authority.
-- Runtime roles cannot write this table directly.

create table if not exists private.x1_worker_control_guard (
  worker_id text primary key references private.x1_worker_registry(worker_id) on delete cascade,
  tenant_id uuid not null,
  environment text not null check (environment in ('development','preview','production')),
  execution_plane text not null check (execution_plane in ('jarvis-local','local-ollama','railway','validator','cloud')),
  controller_id text not null,
  control_epoch text not null,
  lease_allowed boolean not null default false,
  approval_reference text,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.x1_worker_control_guard enable row level security;
alter table private.x1_worker_control_guard force row level security;

revoke all on private.x1_worker_control_guard from public, anon, authenticated, service_role;

insert into private.x1_worker_control_guard(
  worker_id,tenant_id,environment,execution_plane,controller_id,control_epoch,
  lease_allowed,approval_reference,reason,metadata,updated_at
) values
(
  'x1-swarm-preview-1',
  '666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid,
  'preview','railway',
  'worker-fabric-controller-v1',
  'controller-convergence-20261003-v1',
  true,
  'APPROVE X1 STAGING CONTROLLER CONVERGENCE + JARVIS CAPABILITY ALIGNMENT',
  'RAILWAY_CONTINUITY_ALLOWED',
  '{"production_authority":false}'::jsonb,
  now()
),
(
  'jarvis-local-power-grid-1',
  '666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid,
  'preview','jarvis-local',
  'worker-fabric-controller-v1',
  'controller-convergence-20261003-v1',
  false,
  'APPROVE X1 STAGING CONTROLLER CONVERGENCE + JARVIS CAPABILITY ALIGNMENT',
  'JARVIS_CANARY_COMPLETED_REHELD',
  '{"signed_canary_passed":true,"qa_phaseb_canary_passed":true,"production_authority":false}'::jsonb,
  now()
),
(
  'jarvis-local-ollama-1',
  '666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid,
  'preview','local-ollama',
  'worker-fabric-controller-v1',
  'controller-convergence-20261003-v1',
  false,
  null,
  'LOCAL_OLLAMA_UNBOUND',
  '{"production_authority":false}'::jsonb,
  now()
)
on conflict (worker_id)
do update set
  tenant_id=excluded.tenant_id,
  environment=excluded.environment,
  execution_plane=excluded.execution_plane,
  controller_id=excluded.controller_id,
  control_epoch=excluded.control_epoch,
  lease_allowed=excluded.lease_allowed,
  approval_reference=excluded.approval_reference,
  reason=excluded.reason,
  metadata=excluded.metadata,
  updated_at=now();
