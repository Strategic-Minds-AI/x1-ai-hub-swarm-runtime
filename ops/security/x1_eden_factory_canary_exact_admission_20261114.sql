-- X1 staging-only candidate. NOT approved for activation until independently tested.
-- Current bound runtime head: b270df7b131358cd8426791e2794356c6c1113dc
-- Retains the entire original functions; adds only exact canary deny-by-default predicates.
BEGIN;
SET LOCAL lock_timeout='4s';
SET LOCAL statement_timeout='25s';
DO $preflight$
BEGIN
 IF (SELECT allowed_action_classes<>ARRAY['READ_ONLY']::text[]
     FROM private.x1_worker_registry WHERE worker_id='x1-swarm-preview-1' AND tenant_id='666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'X1_EDEN_WORKER_PERMISSION_DRIFT'; END IF;
 IF EXISTS (SELECT 1 FROM public.x1_work_queue WHERE task_id='eden.factory.canary.20261114')
 THEN RAISE EXCEPTION 'X1_EDEN_CANARY_ALREADY_EXISTS'; END IF;
END $preflight$;
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
    -- X1_EDEN_CANARY_ADMISSION_V1: restrict preview worker to READ_ONLY or this exact one-use tuple.
    and ((q.task_id <> 'eden.factory.canary.20261114' and (p_worker_id <> 'x1-swarm-preview-1' or q.action_class='READ_ONLY'))
      or (q.task_id = 'eden.factory.canary.20261114' and q.tenant_id='666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid
       AND q.mission_id='EDEN-UNIVERSAL-MCP-FACTORY-20261114'
       AND q.task_id='eden.factory.canary.20261114'
       AND q.action_class='NON_PRODUCTION_MUTATION'
       AND q.source_sha='72b0b78afa6ebf0dc6693683ee0a9a20d618baa9'
       AND q.idempotency_key='7ab67b1524eb880c2bc3437c9350dadb756a002d1f45a3dea0b19d56737f7a6a'
       AND q.required_capabilities=jsonb_build_array(jsonb_build_object('id','x1:eden-factory-canary:v1','mechanism','policy'))
       AND q.payload=jsonb_build_object('kind','EDEN_FACTORY_CANARY_V1','repo','Strategic-Minds-AI/eden-universal-mcp-factory','branch','feature/eden-autocode-reconciler-20261114','objective','One fixed original synthetic test','allowed_paths',jsonb_build_array('tests/x1-worker-canary.test.mjs'),'validation',jsonb_build_array('unit'),'synthetic',true,'no_spend',true,'no_customer_data',true,'customer_outbound',false,'production_release',false)
       AND q.attempts=0
       AND q.max_attempts=1
       AND q.lease_id IS NULL
       AND q.approval_reference IS NULL
       AND p_environment='preview'
       AND p_tenant_id='666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid
       AND p_worker_id='x1-swarm-preview-1'
       AND now()<'2026-11-16 12:00:00+00'::timestamptz
       AND v_worker.allowed_capabilities ? 'x1:eden-factory-canary:v1'
       AND 'NON_PRODUCTION_MUTATION' = ANY(v_worker.allowed_action_classes)
       AND v_worker.metadata->>'eden_factory_canary_enabled'='true'))
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
  v_worker private.x1_worker_registry%rowtype;
  v_lease_id text;
begin
  if p_environment not in ('development','preview') then
    raise exception 'NON_PRODUCTION_ONLY';
  end if;
  if p_ttl_seconds < 30 or p_ttl_seconds > 900 then
    raise exception 'LEASE_TTL_INVALID';
  end if;

  -- X1_EDEN_CANARY_ADMISSION_V1: explicit worker identity and control guard.
  if p_worker_id='x1-swarm-preview-1' then
    select wr.* into v_worker from private.x1_worker_registry wr
    where wr.worker_id=p_worker_id and wr.tenant_id=p_tenant_id
      and wr.environment='preview' and wr.execution_plane='railway'
      and wr.enabled=true and wr.credential_binding_state='BOUND'
      and coalesce(wr.metadata->>'lease_hold','false') <> 'true'
      and exists (
        select 1 from private.x1_worker_control_guard cg
        where cg.worker_id=wr.worker_id and cg.tenant_id=wr.tenant_id
          and cg.environment=wr.environment and cg.execution_plane=wr.execution_plane
          and cg.controller_id='worker-fabric-controller-v1'
          and cg.control_epoch='controller-convergence-20261003-v1'
          and cg.lease_allowed=true
      );
    if not found then raise exception 'X1_EDEN_WORKER_CONTEXT_INVALID'; end if;
  end if;

  select q.* into v_work
  from public.x1_work_queue q
  where q.work_id=p_work_id
    and tenant_id=p_tenant_id
    and status='PENDING'
    and available_at <= now()
    and attempts < max_attempts
    and action_class in ('READ_ONLY','NON_PRODUCTION_MUTATION')
    -- X1_EDEN_CANARY_ADMISSION_V1: restrict preview worker to READ_ONLY or this exact one-use tuple.
    and ((q.task_id <> 'eden.factory.canary.20261114' and (p_worker_id <> 'x1-swarm-preview-1' or q.action_class='READ_ONLY'))
      or (q.task_id = 'eden.factory.canary.20261114' and q.tenant_id='666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid
       AND q.mission_id='EDEN-UNIVERSAL-MCP-FACTORY-20261114'
       AND q.task_id='eden.factory.canary.20261114'
       AND q.action_class='NON_PRODUCTION_MUTATION'
       AND q.source_sha='72b0b78afa6ebf0dc6693683ee0a9a20d618baa9'
       AND q.idempotency_key='7ab67b1524eb880c2bc3437c9350dadb756a002d1f45a3dea0b19d56737f7a6a'
       AND q.required_capabilities=jsonb_build_array(jsonb_build_object('id','x1:eden-factory-canary:v1','mechanism','policy'))
       AND q.payload=jsonb_build_object('kind','EDEN_FACTORY_CANARY_V1','repo','Strategic-Minds-AI/eden-universal-mcp-factory','branch','feature/eden-autocode-reconciler-20261114','objective','One fixed original synthetic test','allowed_paths',jsonb_build_array('tests/x1-worker-canary.test.mjs'),'validation',jsonb_build_array('unit'),'synthetic',true,'no_spend',true,'no_customer_data',true,'customer_outbound',false,'production_release',false)
       AND q.attempts=0
       AND q.max_attempts=1
       AND q.lease_id IS NULL
       AND q.approval_reference IS NULL
       AND p_environment='preview'
       AND p_tenant_id='666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid
       AND p_worker_id='x1-swarm-preview-1'
       AND now()<'2026-11-16 12:00:00+00'::timestamptz
       AND v_worker.allowed_capabilities ? 'x1:eden-factory-canary:v1'
       AND 'NON_PRODUCTION_MUTATION' = ANY(v_worker.allowed_action_classes)
       AND v_worker.metadata->>'eden_factory_canary_enabled'='true'))
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
