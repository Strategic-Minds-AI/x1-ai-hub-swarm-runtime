-- Break-glass only. X1 STAGING uvdkzsbjackpjvpoxtyk. Restores original
-- enqueue function, including original mission replay defect. NOT automatic.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION public.x1_enqueue_work(p_work jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_existing_task text;
  v_existing_packet text;
  v_existing_mission text;
begin
  select work_id, task_id, work_packet_id, mission_id
    into v_id, v_existing_task, v_existing_packet, v_existing_mission
  from public.x1_work_queue
  where idempotency_key = p_work->>'idempotency_key';

  if found then
    if v_existing_task is distinct from p_work->>'task_id'
       or v_existing_packet is distinct from p_work->>'work_packet_id'
       or v_existing_mission is distinct from nullif(p_work->>'mission_id','') then
      raise exception 'WORK_IDEMPOTENCY_CONFLICT';
    end if;
    return v_id;
  end if;

  insert into public.x1_work_queue(
    tenant_id, mission_id, work_packet_id, task_id, requested_by, action_class,
    required_capabilities, payload, source_sha, idempotency_key,
    priority, available_at, max_attempts, approval_reference,
    validation_receipt_id, rollback_reference
  ) values (
    (p_work->>'tenant_id')::uuid,
    nullif(p_work->>'mission_id',''),
    p_work->>'work_packet_id',
    p_work->>'task_id',
    p_work->>'requested_by',
    p_work->>'action_class',
    coalesce(p_work->'required_capabilities','[]'::jsonb),
    coalesce(p_work->'payload','{}'::jsonb),
    nullif(p_work->>'source_sha',''),
    p_work->>'idempotency_key',
    coalesce((p_work->>'priority')::integer,100),
    coalesce((p_work->>'available_at')::timestamptz,now()),
    coalesce((p_work->>'max_attempts')::integer,3),
    nullif(p_work->>'approval_reference',''),
    nullif(p_work->>'validation_receipt_id',''),
    nullif(p_work->>'rollback_reference','')
  ) returning work_id into v_id;

  return v_id;
end;
$function$;
COMMIT;
