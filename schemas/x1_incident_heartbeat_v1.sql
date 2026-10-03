begin;

create table if not exists public.x1_incidents (
  incident_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  incident_key text not null unique,
  severity text not null check (severity in ('P0','P1','P2','P3','P4','P5','P6','P7')),
  category text not null,
  status text not null default 'OPEN' check (status in ('OPEN','MITIGATED','RESOLVED','BLOCKED')),
  source_system text not null,
  related_work_id uuid null references public.x1_work_queue(work_id) on delete set null,
  failure_fingerprint text null,
  summary text not null,
  evidence jsonb not null default '[]'::jsonb,
  workaround jsonb not null default '{}'::jsonb,
  next_action text null,
  attempts integer not null default 0 check (attempts >= 0),
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz null
);

create index if not exists x1_incidents_status_priority_idx
  on public.x1_incidents(status, severity, updated_at desc);

alter table public.x1_incidents enable row level security;
alter table public.x1_incidents force row level security;
revoke all on table public.x1_incidents from public, anon, authenticated;
grant select, insert, update on table public.x1_incidents to service_role;

create table if not exists public.x1_worker_heartbeats (
  heartbeat_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  worker_id text not null,
  environment text not null check (environment in ('development','preview','production')),
  execution_plane text not null,
  identity_fingerprint text not null,
  artifact_digest text not null,
  runtime_state text not null check (runtime_state in ('ONLINE','DEGRADED','STALE','OFFLINE','BOOTING')),
  health jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);

create index if not exists x1_worker_heartbeats_worker_time_idx
  on public.x1_worker_heartbeats(worker_id, observed_at desc);

alter table public.x1_worker_heartbeats enable row level security;
alter table public.x1_worker_heartbeats force row level security;
revoke all on table public.x1_worker_heartbeats from public, anon, authenticated;
grant select, insert on table public.x1_worker_heartbeats to service_role;

create or replace function public.x1_record_worker_heartbeat(
  p_worker_id text,
  p_tenant_id uuid,
  p_environment text,
  p_execution_plane text,
  p_identity_fingerprint text,
  p_artifact_digest text,
  p_runtime_state text,
  p_health jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_registry private.x1_worker_registry%rowtype;
  v_guard private.x1_worker_control_guard%rowtype;
  v_now timestamptz := now();
begin
  if p_runtime_state not in ('ONLINE','DEGRADED','STALE','OFFLINE','BOOTING') then
    raise exception 'WORKER_HEARTBEAT_STATE_INVALID';
  end if;

  select * into v_registry
  from private.x1_worker_registry
  where worker_id = p_worker_id;

  if not found then
    raise exception 'WORKER_HEARTBEAT_UNREGISTERED';
  end if;

  if v_registry.tenant_id <> p_tenant_id
     or v_registry.environment <> p_environment
     or v_registry.execution_plane <> p_execution_plane
     or v_registry.identity_fingerprint <> p_identity_fingerprint
     or v_registry.artifact_digest <> p_artifact_digest then
    raise exception 'WORKER_HEARTBEAT_IDENTITY_MISMATCH';
  end if;

  insert into public.x1_worker_heartbeats(
    tenant_id, worker_id, environment, execution_plane,
    identity_fingerprint, artifact_digest, runtime_state, health, observed_at
  ) values (
    p_tenant_id, p_worker_id, p_environment, p_execution_plane,
    p_identity_fingerprint, p_artifact_digest, p_runtime_state, coalesce(p_health,'{}'::jsonb), v_now
  );

  update private.x1_worker_registry
  set last_heartbeat = v_now, updated_at = v_now
  where worker_id = p_worker_id;

  select * into v_guard
  from private.x1_worker_control_guard
  where worker_id = p_worker_id;

  return jsonb_build_object(
    'ok', true,
    'worker_id', p_worker_id,
    'heartbeat_at', v_now,
    'enabled', v_registry.enabled,
    'lease_allowed', coalesce(v_guard.lease_allowed, false),
    'controller_id', v_guard.controller_id,
    'control_epoch', v_guard.control_epoch
  );
end;
$$;

revoke all on function public.x1_record_worker_heartbeat(text,uuid,text,text,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.x1_record_worker_heartbeat(text,uuid,text,text,text,text,text,jsonb)
  to service_role;

commit;
