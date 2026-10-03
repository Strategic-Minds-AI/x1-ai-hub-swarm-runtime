-- STAGED ONLY. Do not apply to production without explicit approval.
-- Generic X1 workers remain on x1_lease_next_work and now ignore lane-tagged work.
-- Super Agent workers use x1_lease_next_work_for_lane and only lease their exact lane.

create or replace function public.x1_lease_next_work(
  p_tenant_id uuid,
  p_worker_id text,
  p_environment text,
  p_ttl_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_work public.x1_work_queue%rowtype;
  v_lease_id text;
begin
  if p_environment not in ('development','preview','production') then
    raise exception 'ENVIRONMENT_INVALID';
  end if;
  if p_ttl_seconds < 30 or p_ttl_seconds > 600 then
    raise exception 'LEASE_TTL_INVALID';
  end if;

  select * into v_work
  from public.x1_work_queue
  where tenant_id=p_tenant_id
    and status='PENDING'
    and available_at <= now()
    and attempts < max_attempts
    and coalesce(payload->>'agent_lane','') = ''
    and (task_id !~ '^artifact[.]finalized:[0-9a-f]{24}$' or p_worker_id='x1-preview-reconciler')
    and (
      coalesce(payload->>'execution_target','') not in ('jarvis-local','local-ollama')
      or p_worker_id like 'jarvis-local-%'
    )
    and (
      action_class='READ_ONLY'
      or (action_class='NON_PRODUCTION_MUTATION' and p_environment <> 'production')
      or (action_class='PROTECTED_MUTATION' and approval_reference is not null)
      or (
        action_class='PRODUCTION_RELEASE'
        and approval_reference is not null
        and validation_receipt_id is not null
        and rollback_reference is not null
      )
    )
  order by priority desc, available_at asc, created_at asc
  for update skip locked
  limit 1;

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

revoke all on function public.x1_lease_next_work(uuid,text,text,integer) from public;
revoke all on function public.x1_lease_next_work(uuid,text,text,integer) from anon;
revoke all on function public.x1_lease_next_work(uuid,text,text,integer) from authenticated;
grant execute on function public.x1_lease_next_work(uuid,text,text,integer) to service_role;

create or replace function public.x1_lease_next_work_for_lane(
  p_tenant_id uuid,
  p_worker_id text,
  p_environment text,
  p_agent_lane text,
  p_ttl_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_work public.x1_work_queue%rowtype;
  v_lease_id text;
begin
  if p_environment not in ('development','preview','production') then
    raise exception 'ENVIRONMENT_INVALID';
  end if;
  if p_ttl_seconds < 30 or p_ttl_seconds > 600 then
    raise exception 'LEASE_TTL_INVALID';
  end if;
  if p_agent_lane not in (
    'orchestrator','growth_operator','code_architect','social_strategist',
    'sales_engine','brand_guardian','replicator','swarm'
  ) then
    raise exception 'AGENT_LANE_INVALID';
  end if;

  select * into v_work
  from public.x1_work_queue
  where tenant_id=p_tenant_id
    and status='PENDING'
    and available_at <= now()
    and attempts < max_attempts
    and coalesce(payload->>'agent_lane','') = p_agent_lane
    and (
      action_class='READ_ONLY'
      or (action_class='NON_PRODUCTION_MUTATION' and p_environment <> 'production')
      or (action_class='PROTECTED_MUTATION' and approval_reference is not null)
      or (
        action_class='PRODUCTION_RELEASE'
        and approval_reference is not null
        and validation_receipt_id is not null
        and rollback_reference is not null
      )
    )
  order by priority desc, available_at asc, created_at asc
  for update skip locked
  limit 1;

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

revoke all on function public.x1_lease_next_work_for_lane(uuid,text,text,text,integer) from public;
revoke all on function public.x1_lease_next_work_for_lane(uuid,text,text,text,integer) from anon;
revoke all on function public.x1_lease_next_work_for_lane(uuid,text,text,text,integer) from authenticated;
grant execute on function public.x1_lease_next_work_for_lane(uuid,text,text,text,integer) to service_role;
