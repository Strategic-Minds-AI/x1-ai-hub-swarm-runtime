-- X1 STAGING uvdkzsbjackpjvpoxtyk | BREAK-GLASS ONLY.
-- Exact original recovery function, including automatic retry of ambiguous
-- leases; restoring it makes duplicate effects possible and needs approval.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION public.x1_recover_expired_leases(p_limit integer DEFAULT 16)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_row record;
  v_requeued integer := 0;
  v_dead integer := 0;
  v_expired integer := 0;
begin
  if p_limit < 1 or p_limit > 64 then
    raise exception 'RECOVERY_LIMIT_OUT_OF_RANGE';
  end if;

  for v_row in
    select l.lease_id, l.task_id, q.work_id, q.attempts, q.max_attempts
    from public.x1_task_leases l
    join public.x1_work_queue q on q.lease_id=l.lease_id
    where l.status='ACTIVE'
      and l.expires_at < now()
      and q.status='LEASED'
    order by l.expires_at asc
    for update of l,q skip locked
    limit p_limit
  loop
    update public.x1_task_leases
      set status='EXPIRED', updated_at=now()
      where lease_id=v_row.lease_id and status='ACTIVE';
    v_expired := v_expired + 1;

    if v_row.attempts >= v_row.max_attempts then
      update public.x1_work_queue
        set status='DEAD_LETTER',
            lease_id=null,
            last_error_code='LEASE_EXPIRED_MAX_ATTEMPTS',
            updated_at=now()
        where work_id=v_row.work_id;
      v_dead := v_dead + 1;
    else
      update public.x1_work_queue
        set status='PENDING',
            lease_id=null,
            last_error_code='LEASE_EXPIRED_REQUEUED',
            available_at=now()+interval '30 seconds',
            updated_at=now()
        where work_id=v_row.work_id;
      v_requeued := v_requeued + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'status','PASS',
    'expired',v_expired,
    'requeued',v_requeued,
    'dead_lettered',v_dead,
    'ran_at',now()
  );
end;
$function$;
COMMIT;
