-- UNIVERSAL WORKER FABRIC v1
-- JARVIS dedicated staging credential verifier.
-- No plaintext credential is stored in the database.

begin;

create table if not exists private.x1_worker_auth_hashes (
  service_name text not null,
  worker_id text not null references private.x1_worker_registry(worker_id) on delete restrict,
  tenant_id uuid not null,
  environment text not null check (environment in ('development','preview','production')),
  credential_id text not null,
  token_sha256 text not null check (token_sha256 ~ '^[0-9a-f]{64}$'),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (service_name, worker_id, credential_id),
  unique (token_sha256)
);

create index if not exists x1_worker_auth_hashes_active_idx
  on private.x1_worker_auth_hashes(service_name, active, worker_id);

alter table private.x1_worker_auth_hashes enable row level security;
alter table private.x1_worker_auth_hashes force row level security;

revoke all on table private.x1_worker_auth_hashes
  from public, anon, authenticated, service_role;

create or replace function public.x1_match_worker_auth(
  p_service_name text,
  p_token_sha256 text
)
returns text
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_worker_id text;
begin
  if p_token_sha256 !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select worker_id
  into v_worker_id
  from private.x1_worker_auth_hashes
  where service_name=p_service_name
    and token_sha256=p_token_sha256
    and active=true
  limit 1;

  return v_worker_id;
end;
$function$;

revoke execute on function public.x1_match_worker_auth(text,text)
  from public, anon, authenticated;
grant execute on function public.x1_match_worker_auth(text,text)
  to postgres, service_role;

commit;
