-- Rollback for exact staging-only X1 EDEN canary admission, NOT an activation script.
-- Requires scoped owner approval and check for other edits before applying.
BEGIN;
SET LOCAL lock_timeout='4s';
SET LOCAL statement_timeout='25s';
CREATE OR REPLACE FUNCTION public.x1_lease_next_work(p_tenant_id uuid, p_worker_id text, p_environment text, p_ttl_seconds integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
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

  select wr.*
  into v_worker
  from private.x1_worker_registry wr
  where wr.worker_id=p_worker_id
    and wr.tenant_id=p_tenant_id
    and wr.environment=p_environment
    and wr.enabled=true
    and wr.credential_binding_state='BOUND'
    and coalesce(wr.metadata->>'lease_hold','false') <> 'true'
    and exists (
      select 1
      from private.x1_worker_control_guard guard
      where guard.worker_id=wr.worker_id
        and guard.tenant_id=wr.tenant_id
        and guard.environment=wr.environment
        and guard.execution_plane=wr.execution_plane
        and guard.controller_id='worker-fabric-controller-v1'
        and guard.control_epoch='controller-convergence-20261003-v1'
        and guard.lease_allowed=true
    );

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
    -- CANARY HOLD (review only): no non-readonly factory leasing before independently scoped V2 admission.
    and (q.task_id <> '6af2808640da255ff7e31f5c' or q.action_class = 'READ_ONLY')
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
    'tenant_id',v_work.tenant_id,'mission_id',v_work.mission_id,'requested_by',v_work.requested_by,'action_class',v_work.action_class,
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
CREATE OR REPLACE FUNCTION public.x1_lease_work_by_id(p_tenant_id uuid, p_worker_id text, p_environment text, p_work_id uuid, p_ttl_seconds integer DEFAULT 600)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_work public.x1_work_queue%rowtype;
  v_lease_id text;
begin
  if p_environment not in ('development','preview') then
    raise exception 'NON_PRODUCTION_ONLY';
  end if;
  if p_ttl_seconds < 30 or p_ttl_seconds > 900 then
    raise exception 'LEASE_TTL_INVALID';
  end if;

  select * into v_work
  from public.x1_work_queue
  where work_id=p_work_id
    and tenant_id=p_tenant_id
    and status='PENDING'
    and available_at <= now()
    and attempts < max_attempts
    and action_class in ('READ_ONLY','NON_PRODUCTION_MUTATION')
  for update skip locked;

  if not found then return null; end if;

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

  return jsonb_build_object(
    'work_id',v_work.work_id,
    'work_packet_id',v_work.work_packet_id,
    'task_id',v_work.task_id,
    'tenant_id',v_work.tenant_id,
    'action_class',v_work.action_class,
    'payload',v_work.payload,
    'source_sha',v_work.source_sha,
    'idempotency_key',v_work.idempotency_key,
    'attempt',v_work.attempts+1,
    'lease',jsonb_build_object(
      'leaseId',v_lease_id,
      'taskId',v_work.task_id,
      'holderAgentId',p_worker_id,
      'acquiredAt',now(),
      'expiresAt',now()+make_interval(secs=>p_ttl_seconds)
    )
  );
end;
$function$;
COMMIT;
