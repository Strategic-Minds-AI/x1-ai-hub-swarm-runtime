-- UNIVERSAL WORKER FABRIC v1
-- Phase B: lease enforcement against the registered worker identity table.
-- DRAFT ONLY. Do not apply until:
--   1. schemas/x1_worker_registry_v1.sql is applied to X1 AI Hub Staging,
--   2. the Railway preview worker is registered + BOUND,
--   3. JARVIS is registered but remains disabled until its approved credential binding exists,
--   4. rollback SQL is prepared and validated.
--
-- Source baseline: live X1 AI Hub Staging function definitions inspected 2026-10-03.
-- Capability enforcement accepts both legacy string arrays and object-form {"id": "..."} requirements.
-- Missing/malformed/empty capability requirements fail closed.
-- Registry metadata lease_hold=true blocks lease + execution claim even if enabled is flipped by another controller.
-- Unregistered historical workers (including x1-preview-reconciler/local-ollama) fail closed until separately registered.

create or replace function public.x1_lease_next_work(
  p_tenant_id uuid,
  p_worker_id text,
  p_environment text,
  p_ttl_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_work public.x1_work_queue%rowtype;
  v_worker private.x1_worker_registry%rowtype;
  v_lease_id text;
begin
  if p_environment not in ('development','preview','production') then
    raise exception 'ENVIRONMENT_INVALID';
  end if;
  if p_ttl_seconds < 30 or p_ttl_seconds > 600 then
    raise exception 'LEASE_TTL_INVALID';
  end if;

  select *
  into v_worker
  from private.x1_worker_registry
  where worker_id=p_worker_id
    and tenant_id=p_tenant_id
    and environment=p_environment
    and enabled=true
    and credential_binding_state='BOUND'
    and coalesce(metadata->>'lease_hold','false') <> 'true';

  if not found then
    raise exception 'WORKER_NOT_REGISTERED_OR_DISABLED';
  end if;

  select q.*
  into v_work
  from public.x1_work_queue q
  where q.tenant_id=p_tenant_id
    and q.status='PENDING'
    and q.available_at <= now()
    and q.attempts < q.max_attempts
    and jsonb_array_length(q.required_capabilities) > 0
    and coalesce(q.payload->>'agent_lane','') = ''
    and (q.task_id !~ '^artifact[.]finalized:[0-9a-f]{24}$' or p_worker_id='x1-preview-reconciler')
    and (
      coalesce(q.payload->>'execution_target','') = ''
      or coalesce(q.payload->>'execution_target','') = v_worker.execution_plane
    )
    and q.action_class = any(v_worker.allowed_action_classes)
    and not exists (
      select 1
      from jsonb_array_elements(q.required_capabilities) as capability(value)
      cross join lateral (
        select case
          when jsonb_typeof(capability.value)='string' then capability.value #>> '{}'
          when jsonb_typeof(capability.value)='object' then capability.value->>'id'
          else null
        end as capability_id
      ) resolved
      where coalesce(btrim(resolved.capability_id),'') = ''
         or not (v_worker.allowed_capabilities ? resolved.capability_id)
    )
    and (
      q.action_class='READ_ONLY'
      or (q.action_class='NON_PRODUCTION_MUTATION' and p_environment <> 'production')
      or (q.action_class='PROTECTED_MUTATION' and q.approval_reference is not null)
      or (
        q.action_class='PRODUCTION_RELEASE'
        and q.approval_reference is not null
        and q.validation_receipt_id is not null
        and q.rollback_reference is not null
      )
    )
  order by q.priority desc, q.available_at asc, q.created_at asc
  for update skip locked
  limit 1;

  if not found then
    update private.x1_worker_registry
      set last_heartbeat=now(), updated_at=now()
      where worker_id=p_worker_id;
    return null;
  end if;

  v_lease_id := gen_random_uuid()::text;
  insert into public.x1_task_leases(
    lease_id,task_id,tenant_id,holder_agent_id,acquired_at,expires_at,status
  ) values (
    v_lease_id,v_work.task_id,p_tenant_id,p_worker_id,now(),
    now()+make_interval(secs=>p_ttl_seconds),'ACTIVE'
  );

  update public.x1_work_queue
  set status='LEASED',lease_id=v_lease_id,attempts=attempts+1,updated_at=now()
  where work_id=v_work.work_id;

  update private.x1_worker_registry
  set last_heartbeat=now(), updated_at=now()
  where worker_id=p_worker_id;

  return jsonb_build_object(
    'work_id',v_work.work_id,'work_packet_id',v_work.work_packet_id,'task_id',v_work.task_id,
    'tenant_id',v_work.tenant_id,'requested_by',v_work.requested_by,'action_class',v_work.action_class,
    'required_capabilities',v_work.required_capabilities,'payload',v_work.payload,'source_sha',v_work.source_sha,
    'idempotency_key',v_work.idempotency_key,'approval_reference',v_work.approval_reference,
    'validation_receipt_id',v_work.validation_receipt_id,'rollback_reference',v_work.rollback_reference,
    'attempt',v_work.attempts+1,
    'lease',jsonb_build_object(
      'leaseId',v_lease_id,'taskId',v_work.task_id,'holderAgentId',p_worker_id,
      'acquiredAt',now(),'expiresAt',now()+make_interval(secs=>p_ttl_seconds)
    )
  );
end;
$function$;

revoke execute on function public.x1_lease_next_work(uuid,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.x1_lease_next_work(uuid,text,text,integer)
  to postgres, service_role;

create or replace function public.x1_claim_execution(
  p_task_id text,
  p_tenant_id uuid,
  p_lease_id text,
  p_agent_id text,
  p_idempotency_key text,
  p_attempt integer
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_execution_id uuid;
  v_existing_task text;
  v_existing_lease text;
  v_existing_agent text;
begin
  if not exists (
    select 1
    from private.x1_worker_registry wr
    where wr.worker_id=p_agent_id
      and wr.tenant_id=p_tenant_id
      and wr.enabled=true
      and wr.credential_binding_state='BOUND'
      and coalesce(wr.metadata->>'lease_hold','false') <> 'true'
  ) then
    raise exception 'WORKER_NOT_REGISTERED_OR_DISABLED';
  end if;

  if not exists (
    select 1 from public.x1_task_leases
    where lease_id=p_lease_id and task_id=p_task_id and tenant_id=p_tenant_id
      and holder_agent_id=p_agent_id and status='ACTIVE' and expires_at > now()
  ) then
    raise exception 'LEASE_NOT_ACTIVE_OR_CONTEXT_MISMATCH';
  end if;

  select execution_id, task_id, lease_id, agent_id
  into v_execution_id, v_existing_task, v_existing_lease, v_existing_agent
  from public.x1_execution_ledger where idempotency_key=p_idempotency_key;

  if found then
    if v_existing_task is distinct from p_task_id or v_existing_lease is distinct from p_lease_id
       or v_existing_agent is distinct from p_agent_id then
      raise exception 'EXECUTION_IDEMPOTENCY_CONFLICT';
    end if;
    return v_execution_id;
  end if;

  insert into public.x1_execution_ledger(
    task_id,tenant_id,lease_id,agent_id,idempotency_key,state,attempt
  ) values (
    p_task_id,p_tenant_id,p_lease_id,p_agent_id,p_idempotency_key,'ACTIVE',p_attempt
  )
  returning execution_id into v_execution_id;

  return v_execution_id;
end;
$function$;

revoke execute on function public.x1_claim_execution(text,uuid,text,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.x1_claim_execution(text,uuid,text,text,text,integer)
  to postgres, service_role;
