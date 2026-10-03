-- UNIVERSAL WORKER FABRIC v1
-- Phase A: registered worker identity contract.
-- DRAFT ONLY: do not apply to production. Apply to X1 AI Hub Staging only after operator approval.
--
-- This migration only creates new objects. It does not replace lease/execution RPCs.

create schema if not exists private;

create table if not exists private.x1_worker_registry (
  worker_id text primary key,
  tenant_id uuid not null,
  execution_plane text not null
    check (execution_plane in ('jarvis-local','local-ollama','railway','validator','cloud')),
  environment text not null
    check (environment in ('development','preview','production')),
  enabled boolean not null default false,
  identity_version text not null,
  identity_fingerprint text not null
    check (identity_fingerprint ~ '^[0-9a-f]{64}$'),
  artifact_digest text not null
    check (artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
  credential_id text not null,
  credential_binding_state text not null default 'UNBOUND'
    check (credential_binding_state in ('UNBOUND','BOUND','REVOKED')),
  allowed_action_classes text[] not null default array[]::text[],
  allowed_capabilities jsonb not null default '[]'::jsonb,
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_heartbeat timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint x1_worker_registry_action_classes_valid check (
    allowed_action_classes <@ array[
      'READ_ONLY',
      'NON_PRODUCTION_MUTATION',
      'PROTECTED_MUTATION',
      'PRODUCTION_RELEASE'
    ]::text[]
  ),
  constraint x1_worker_registry_capabilities_array check (
    jsonb_typeof(allowed_capabilities)='array'
  )
);

create index if not exists x1_worker_registry_scope_idx
  on private.x1_worker_registry(tenant_id, environment, execution_plane, enabled);

alter table private.x1_worker_registry enable row level security;
alter table private.x1_worker_registry force row level security;

-- Do not change privileges for unrelated private-schema objects.
revoke all on table private.x1_worker_registry from public, anon, authenticated, service_role;

create or replace function public.x1_assert_worker_identity(
  p_worker_id text,
  p_tenant_id uuid,
  p_environment text,
  p_execution_plane text,
  p_identity_version text,
  p_identity_fingerprint text,
  p_artifact_digest text,
  p_credential_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_worker private.x1_worker_registry%rowtype;
begin
  if p_environment not in ('development','preview','production') then
    raise exception 'WORKER_ENVIRONMENT_INVALID';
  end if;

  select *
  into v_worker
  from private.x1_worker_registry
  where worker_id=p_worker_id
  for update;

  if not found then raise exception 'WORKER_NOT_REGISTERED'; end if;
  if not v_worker.enabled then raise exception 'WORKER_DISABLED'; end if;
  if v_worker.credential_binding_state <> 'BOUND' then raise exception 'WORKER_CREDENTIAL_NOT_BOUND'; end if;
  if v_worker.tenant_id is distinct from p_tenant_id then raise exception 'WORKER_TENANT_MISMATCH'; end if;
  if v_worker.environment is distinct from p_environment then raise exception 'WORKER_ENVIRONMENT_MISMATCH'; end if;
  if v_worker.execution_plane is distinct from p_execution_plane then raise exception 'WORKER_EXECUTION_PLANE_MISMATCH'; end if;
  if v_worker.identity_version is distinct from p_identity_version then raise exception 'WORKER_IDENTITY_VERSION_MISMATCH'; end if;
  if v_worker.identity_fingerprint is distinct from p_identity_fingerprint then raise exception 'WORKER_IDENTITY_FINGERPRINT_MISMATCH'; end if;
  if v_worker.artifact_digest is distinct from p_artifact_digest then raise exception 'WORKER_ARTIFACT_DIGEST_MISMATCH'; end if;
  if v_worker.credential_id is distinct from p_credential_id then raise exception 'WORKER_CREDENTIAL_ID_MISMATCH'; end if;

  update private.x1_worker_registry
  set last_heartbeat=now(), updated_at=now()
  where worker_id=p_worker_id;

  return jsonb_build_object(
    'ok',true,
    'worker_id',p_worker_id,
    'execution_plane',p_execution_plane,
    'environment',p_environment,
    'identity_version',p_identity_version
  );
end;
$function$;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Revoke explicitly.
revoke execute on function public.x1_assert_worker_identity(
  text, uuid, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.x1_assert_worker_identity(
  text, uuid, text, text, text, text, text, text
) to postgres, service_role;

-- No self-registration RPC exists. Registry writes remain operator/admin controlled.
-- Never put plaintext credentials in credential_id or metadata.
