-- BREAK GLASS ONLY: reverts X1 staging completion safety gates.
-- This restores unsafe behavior. Do not execute unless incident response requires it.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION public.x1_complete_execution(p_execution_id uuid, p_receipt_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_state text;
  v_receipt text;
  v_tenant uuid;
  v_task_id text;
  v_agent_id text;
  v_attempt integer;
  v_lease_id text;
  v_work_id uuid;
  v_work_packet_id text;
  v_mission_id text;
  v_source_sha text;
  v_hash text;
begin
  select e.state, e.receipt_id, e.tenant_id, e.task_id, e.agent_id, e.attempt, e.lease_id,
         q.work_id, q.work_packet_id, q.mission_id, q.source_sha
    into v_state, v_receipt, v_tenant, v_task_id, v_agent_id, v_attempt, v_lease_id,
         v_work_id, v_work_packet_id, v_mission_id, v_source_sha
  from public.x1_execution_ledger e
  left join public.x1_work_queue q
    on q.tenant_id=e.tenant_id and q.task_id=e.task_id and q.lease_id=e.lease_id
  where e.execution_id=p_execution_id;

  if not found then raise exception 'EXECUTION_NOT_FOUND'; end if;

  if v_state='COMPLETED' and v_receipt is distinct from p_receipt_id then
    raise exception 'EXECUTION_RECEIPT_MISMATCH';
  end if;

  if v_state='ACTIVE' then
    update public.x1_execution_ledger
      set state='COMPLETED',receipt_id=p_receipt_id,completed_at=now(),updated_at=now()
      where execution_id=p_execution_id;

    update public.x1_task_leases l
      set status='COMPLETED',updated_at=now()
      from public.x1_execution_ledger e
      where e.execution_id=p_execution_id and l.lease_id=e.lease_id;
  elsif v_state <> 'COMPLETED' then
    raise exception 'EXECUTION_NOT_ACTIVE';
  end if;

  v_hash := encode(
    extensions.digest(
      p_receipt_id || ':' || p_execution_id::text || ':' || v_task_id || ':PASS',
      'sha256'
    ),
    'hex'
  );

  insert into public.x1_audit_receipts(
    tenant_id, receipt_type, receipt_id, source_system,
    source_sha, content_hash, payload
  ) values (
    v_tenant,
    'worker_execution',
    p_receipt_id,
    v_agent_id,
    v_source_sha,
    v_hash,
    jsonb_build_object(
      'execution_id',p_execution_id,
      'work_id',v_work_id,
      'mission_id',v_mission_id,
      'work_packet_id',v_work_packet_id,
      'task_id',v_task_id,
      'agent_id',v_agent_id,
      'lease_id',v_lease_id,
      'attempt',v_attempt,
      'status','PASS'
    )
  )
  on conflict (tenant_id,receipt_type,receipt_id) do nothing;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.x1_finish_work(p_work_id uuid, p_lease_id text, p_status text, p_error_code text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_attempts integer;
  v_max_attempts integer;
begin
  if p_status not in ('COMPLETED','FAILED','BLOCKED') then raise exception 'WORK_FINISH_STATUS_INVALID'; end if;
  select attempts,max_attempts into v_attempts,v_max_attempts
  from public.x1_work_queue
  where work_id=p_work_id and lease_id=p_lease_id and status='LEASED'
  for update;
  if not found then raise exception 'WORK_LEASE_CONTEXT_MISMATCH'; end if;

  if p_status='COMPLETED' then
    update public.x1_work_queue set status='COMPLETED',last_error_code=null,updated_at=now() where work_id=p_work_id;
    update public.x1_task_leases set status='COMPLETED',updated_at=now() where lease_id=p_lease_id;
  elsif p_status='BLOCKED' then
    update public.x1_work_queue set status='BLOCKED',last_error_code=p_error_code,updated_at=now() where work_id=p_work_id;
    update public.x1_task_leases set status='RELEASED',updated_at=now() where lease_id=p_lease_id;
  elsif v_attempts >= v_max_attempts then
    update public.x1_work_queue set status='DEAD_LETTER',last_error_code=p_error_code,updated_at=now() where work_id=p_work_id;
    update public.x1_task_leases set status='FAILED',updated_at=now() where lease_id=p_lease_id;
  else
    update public.x1_work_queue
      set status='PENDING',lease_id=null,last_error_code=p_error_code,
          available_at=now()+make_interval(secs=>least(300,30*(2^greatest(v_attempts-1,0)))),updated_at=now()
      where work_id=p_work_id;
    update public.x1_task_leases set status='FAILED',updated_at=now() where lease_id=p_lease_id;
  end if;
end;
$function$
;
COMMIT;
