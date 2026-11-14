-- X1 STAGING ONLY. Private metadata schema, NOT a second queue or scheduler.
-- This migration must not be applied to X1 Production without separately scoped approval.
create schema if not exists sandbox_fleet;
comment on schema sandbox_fleet is 'Short-lived isolated workspace metadata for X1 staging; not exposed through PostgREST.';

revoke all on schema sandbox_fleet from public, anon, authenticated;

create table if not exists sandbox_fleet.workspaces (
  sandbox_id text primary key check (sandbox_id ~ '^sbx-[a-f0-9]{20}$'),
  tenant_id uuid not null,
  client_slug text not null check (client_slug ~ '^[a-z0-9][a-z0-9-]{0,47}[a-z0-9]$'),
  mission_id text not null,
  idempotency_key text not null,
  source_sha text not null check (source_sha ~ '^[a-fA-F0-9]{40,64}$'),
  state text not null default 'REQUESTED' check (state in ('REQUESTED','LEASED','BUILDING','TESTING','REPAIRING','VERIFIED','ARCHIVED','CLEANED','FAILED','QUARANTINED')),
  owner_tag text not null check (owner_tag = 'sandbox:' || sandbox_id),
  resource_prefix text not null check (resource_prefix = 'sandbox/' || sandbox_id || '/'),
  budget_cents integer not null default 0 check (budget_cents between 0 and 50000),
  spent_cents integer not null default 0 check (spent_cents >= 0 and spent_cents <= budget_cents),
  budget_approval_ref text,
  revision integer not null default 0 check (revision >= 0),
  archives_verified boolean not null default false,
  lease_holder text,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (tenant_id, mission_id, idempotency_key),
  check (expires_at > created_at and expires_at <= created_at + interval '120 minutes'),
  check (budget_cents = 0 or nullif(btrim(budget_approval_ref), '') is not null),
  check (state <> 'CLEANED' or archives_verified)
);

create table if not exists sandbox_fleet.resource_receipts (
  sandbox_id text not null references sandbox_fleet.workspaces(sandbox_id) on delete restrict,
  provider text not null check (provider in ('github','vercel','railway','supabase-staging','google-drive','local-runner')),
  external_resource_id text not null,
  owner_tag text not null check (owner_tag = 'sandbox:' || sandbox_id),
  resource_key text not null,
  resource_environment text not null check (resource_environment in ('sandbox','preview')),
  lifecycle_state text not null default 'ACTIVE' check (lifecycle_state in ('ACTIVE','CLEANUP_QUEUED','CLEANED','QUARANTINED')),
  evidence_sha256 text check (evidence_sha256 is null or evidence_sha256 ~ '^[a-fA-F0-9]{64}$'),
  observed_at timestamptz not null default now(),
  cleaned_at timestamptz,
  primary key (sandbox_id, provider, external_resource_id),
  check (left(resource_key, length('sandbox/' || sandbox_id || '/')) = 'sandbox/' || sandbox_id || '/'),
  check (lifecycle_state <> 'CLEANED' or cleaned_at is not null)
);

create table if not exists sandbox_fleet.workspace_events (
  event_id text primary key,
  sandbox_id text not null references sandbox_fleet.workspaces(sandbox_id) on delete restrict,
  tenant_id uuid not null,
  previous_revision integer not null check (previous_revision >= 0),
  next_revision integer not null check (next_revision = previous_revision + 1),
  event_type text not null,
  receipt_sha256 text not null check (receipt_sha256 ~ '^[a-fA-F0-9]{64}$'),
  recorded_at timestamptz not null default now()
);

create index if not exists sandbox_fleet_expiry_due_idx on sandbox_fleet.workspaces (expires_at) where state not in ('CLEANED','QUARANTINED');
create index if not exists sandbox_fleet_tenant_state_idx on sandbox_fleet.workspaces (tenant_id, state);
create index if not exists sandbox_fleet_resource_cleanup_idx on sandbox_fleet.resource_receipts (lifecycle_state, observed_at);

alter table sandbox_fleet.workspaces enable row level security;
alter table sandbox_fleet.resource_receipts enable row level security;
alter table sandbox_fleet.workspace_events enable row level security;

revoke all on all tables in schema sandbox_fleet from public, anon, authenticated;
revoke all on all sequences in schema sandbox_fleet from public, anon, authenticated;
grant usage on schema sandbox_fleet to service_role;
grant select, insert, update on all tables in schema sandbox_fleet to service_role;
comment on table sandbox_fleet.workspaces is 'X1-owned ephemeral metadata, TTL at most 120 minutes. No browser or anon access; existing queue remains canonical.';
comment on table sandbox_fleet.resource_receipts is 'Ownership-tagged resources only; independent archive verification required before cleanup.';
