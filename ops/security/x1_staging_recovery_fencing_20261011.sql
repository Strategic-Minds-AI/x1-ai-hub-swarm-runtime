-- X1 AI Hub STAGING ONLY: uvdkzsbjackpjvpoxtyk
-- Reconcile a committed execution whose final queue ack was lost; do not
-- auto-replay a task if its expired lease may already have caused side effects.
-- Reuses the ONE existing recover-expired-leases routine. No new cron or queue.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='x1_recover_expired_leases'
    AND p.pronargs=1 AND NOT p.prosecdef
    AND pg_get_functiondef(p.oid) LIKE '%LEASE_EXPIRED_REQUEUED%'
    AND pg_get_functiondef(p.oid) LIKE '%for update of l,q skip locked%'
  ) THEN RAISE EXCEPTION 'X1_RECOVERY_FUNCTION_DRIFT'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint
     WHERE conrelid='public.x1_audit_receipts'::regclass
     AND conname='x1_audit_receipts_tenant_id_receipt_type_receipt_id_key')
  THEN RAISE EXCEPTION 'X1_RECOVERY_RECEIPT_UNIQUE_REQUIRED'; END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION public.x1_recover_expired_leases(p_limit integer DEFAULT 16)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_row record;
  v_requeued integer := 0;
  v_dead integer := 0;
  v_expired integer := 0;
  v_blocked integer := 0;
  v_reconciled integer := 0;
  v_updated integer;
  v_receipt_id text;
  v_error_code text;
BEGIN
  IF p_limit < 1 OR p_limit > 64 THEN
    RAISE EXCEPTION 'RECOVERY_LIMIT_OUT_OF_RANGE';
  END IF;

  -- A ledger and signed-content-hash receipt can commit while the worker's
  -- final queue RPC response is lost. Repair the queue without rerunning work.
  FOR v_row IN
    SELECT q.work_id,q.lease_id
    FROM public.x1_work_queue q
    JOIN public.x1_task_leases l
      ON l.lease_id=q.lease_id
     AND l.tenant_id=q.tenant_id AND l.task_id=q.task_id
    JOIN public.x1_execution_ledger e
      ON e.lease_id=l.lease_id
     AND e.tenant_id=q.tenant_id AND e.task_id=q.task_id
    JOIN public.x1_audit_receipts ar
      ON ar.tenant_id=e.tenant_id
     AND ar.receipt_type='worker_execution'
     AND ar.receipt_id=e.receipt_id
     AND ar.source_system=e.agent_id
     AND ar.payload->>'execution_id'=e.execution_id::text
     AND ar.payload->>'task_id'=e.task_id
     AND ar.payload->>'status'='PASS'
     AND ar.content_hash=pg_catalog.encode(
       extensions.digest(
         e.receipt_id||':'||e.execution_id::text||':'||e.task_id||':PASS',
         'sha256'
       ),'hex'
     )
    WHERE q.status='LEASED'
      AND l.status='COMPLETED'
      AND e.state='COMPLETED'
      AND e.receipt_id IS NOT NULL
    ORDER BY e.completed_at ASC
    FOR UPDATE OF q SKIP LOCKED
    LIMIT p_limit
  LOOP
    UPDATE public.x1_work_queue
    SET status='COMPLETED',last_error_code=NULL,updated_at=now()
    WHERE work_id=v_row.work_id
      AND lease_id=v_row.lease_id AND status='LEASED';
    GET DIAGNOSTICS v_updated=ROW_COUNT;
    v_reconciled:=v_reconciled+v_updated;
  END LOOP;

  -- Expiry and recovery remain mutually exclusive within one row lock.
  FOR v_row IN
    SELECT l.lease_id,l.task_id,l.tenant_id,q.work_id,q.action_class,
           q.attempts,q.max_attempts,q.source_sha,
           EXISTS(
             SELECT 1 FROM public.x1_execution_ledger e
             WHERE e.lease_id=l.lease_id AND e.task_id=l.task_id
             AND e.tenant_id=l.tenant_id AND e.state IN ('ACTIVE','COMPLETED')
           ) AS has_ambiguous_execution
    FROM public.x1_task_leases l
    JOIN public.x1_work_queue q ON q.lease_id=l.lease_id
      AND q.task_id=l.task_id AND q.tenant_id=l.tenant_id
    WHERE l.status='ACTIVE' AND l.expires_at < now()
      AND q.status='LEASED'
    ORDER BY l.expires_at ASC
    FOR UPDATE OF l,q SKIP LOCKED
    LIMIT pg_catalog.greatest(p_limit-v_reconciled,0)
  LOOP
    UPDATE public.x1_task_leases
    SET status='EXPIRED',updated_at=now()
    WHERE lease_id=v_row.lease_id AND status='ACTIVE';
    v_expired:=v_expired+1;

    -- An ACTIVE/COMPLETED ledger may mean a handler already ran.
    -- Non-read-only jobs are never blindly replayed after lease expiry.
    IF v_row.has_ambiguous_execution OR v_row.action_class <> 'READ_ONLY' THEN
      v_error_code:='LEASE_EXPIRED_UNCERTAIN_EXECUTION';
      UPDATE public.x1_work_queue
      SET status='BLOCKED',last_error_code=v_error_code,updated_at=now()
      WHERE work_id=v_row.work_id AND lease_id=v_row.lease_id AND status='LEASED';
      v_blocked:=v_blocked+1;
      v_receipt_id:='x1-expired-lease-block:'||v_row.lease_id;
      INSERT INTO public.x1_audit_receipts(
        tenant_id,receipt_type,receipt_id,source_system,source_sha,
        content_hash,payload
      ) VALUES (
        v_row.tenant_id,'reconcile_blocked',v_receipt_id,
        'x1-recovery-fence',v_row.source_sha,
        pg_catalog.encode(extensions.digest(v_receipt_id||':'||v_error_code,'sha256'),'hex'),
        pg_catalog.jsonb_build_object(
          'work_id',v_row.work_id,'task_id',v_row.task_id,
          'lease_id',v_row.lease_id,'reason',v_error_code,
          'ambiguous_ledger',v_row.has_ambiguous_execution,
          'action_class',v_row.action_class,'status','BLOCKED'
        )
      ) ON CONFLICT (tenant_id,receipt_type,receipt_id) DO NOTHING;
    ELSIF v_row.attempts >= v_row.max_attempts THEN
      UPDATE public.x1_work_queue
      SET status='DEAD_LETTER',lease_id=NULL,
          last_error_code='LEASE_EXPIRED_MAX_ATTEMPTS',updated_at=now()
      WHERE work_id=v_row.work_id AND lease_id=v_row.lease_id AND status='LEASED';
      v_dead:=v_dead+1;
    ELSE
      UPDATE public.x1_work_queue
      SET status='PENDING',lease_id=NULL,
          last_error_code='LEASE_EXPIRED_REQUEUED',
          available_at=now()+interval '30 seconds',updated_at=now()
      WHERE work_id=v_row.work_id AND lease_id=v_row.lease_id AND status='LEASED';
      v_requeued:=v_requeued+1;
    END IF;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'status','PASS','reconciled_success',v_reconciled,
    'expired',v_expired,'blocked_uncertain',v_blocked,
    'requeued',v_requeued,'dead_lettered',v_dead,'ran_at',now()
  );
END;
$function$;
COMMIT;
