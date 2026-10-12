-- X1 PREVIEW/STAGING ONLY: existing X1 queue completion fences.
-- Exact project uvdkzsbjackpjvpoxtyk. No new queue/worker/RLS/scheduler.
-- Repairs unauthorized or expired execution completion, fake queue ACK, receipt replay.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $guard$
DECLARE a text; b text;
BEGIN
 SELECT md5(pg_get_functiondef(p.oid)) INTO a
 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
 AND p.proname='x1_complete_execution' AND p.pronargs=2;
 SELECT md5(pg_get_functiondef(p.oid)) INTO b
 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
 AND p.proname='x1_finish_work' AND p.pronargs=4;
 IF a<>'f95b82a1b6b5f1b04b5ca682d5b0485a'
 OR b<>'bf6a67239fa9959ed111ee7c6f256399'
 THEN RAISE EXCEPTION 'X1_STAGING_COMPLETION_SOURCE_DRIFT'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint
  WHERE conrelid='public.x1_audit_receipts'::regclass
  AND conname='x1_audit_receipts_tenant_id_receipt_type_receipt_id_key') THEN
  RAISE EXCEPTION 'X1_WORKER_RECEIPT_UNIQUE_INDEX_REQUIRED';
 END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.x1_complete_execution(
 p_execution_id uuid, p_receipt_id text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
 e public.x1_execution_ledger%ROWTYPE;
 q public.x1_work_queue%ROWTYPE;
 l public.x1_task_leases%ROWTYPE;
 probe public.x1_execution_ledger%ROWTYPE;
 v_hash text;
 v_stored public.x1_audit_receipts%ROWTYPE;
BEGIN
 IF p_receipt_id IS NULL OR pg_catalog.char_length(p_receipt_id)<8
 OR pg_catalog.char_length(p_receipt_id)>180
 OR p_receipt_id !~ '^[a-zA-Z0-9_:.-]+$'
 THEN RAISE EXCEPTION 'EXECUTION_RECEIPT_ID_INVALID'; END IF;
 -- Probe only for locating the immutable queue/lease identities.
 SELECT * INTO probe FROM public.x1_execution_ledger
  WHERE execution_id=p_execution_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_NOT_FOUND'; END IF;
 -- Follow the same queue -> lease -> ledger lock order as x1_finish_work.
 SELECT * INTO q FROM public.x1_work_queue
  WHERE tenant_id=probe.tenant_id AND task_id=probe.task_id
   AND lease_id=probe.lease_id AND status IN ('LEASED','COMPLETED')
  FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_QUEUE_CONTEXT_MISSING'; END IF;
 SELECT * INTO l FROM public.x1_task_leases
  WHERE lease_id=probe.lease_id AND tenant_id=probe.tenant_id
   AND task_id=probe.task_id
  FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_LEASE_CONTEXT_MISSING'; END IF;
 SELECT * INTO e FROM public.x1_execution_ledger
  WHERE execution_id=p_execution_id FOR UPDATE;
 IF e.tenant_id IS DISTINCT FROM q.tenant_id
 OR e.task_id IS DISTINCT FROM q.task_id
 OR e.lease_id IS DISTINCT FROM q.lease_id
 OR e.agent_id IS DISTINCT FROM l.holder_agent_id THEN
  RAISE EXCEPTION 'EXECUTION_TENANT_LEASE_IDENTITY_MISMATCH';
 END IF;
 IF e.state='COMPLETED' THEN
  IF e.receipt_id IS DISTINCT FROM p_receipt_id OR l.status<>'COMPLETED'
  THEN RAISE EXCEPTION 'EXECUTION_COMPLETION_REPLAY_MISMATCH'; END IF;
 ELSIF e.state='ACTIVE' THEN
  IF q.status<>'LEASED' OR l.status<>'ACTIVE'
    OR l.expires_at <= pg_catalog.clock_timestamp()
    OR l.acquired_at > pg_catalog.clock_timestamp()
    THEN RAISE EXCEPTION 'EXECUTION_LEASE_EXPIRED_OR_NOT_ACTIVE'; END IF;
 ELSE
  RAISE EXCEPTION 'EXECUTION_NOT_ACTIVE';
 END IF;
 v_hash:=pg_catalog.encode(extensions.digest(
   p_receipt_id||':'||e.execution_id::text||':'||e.task_id||':PASS',
   'sha256'),'hex');
 -- Proof is INSERTED before completion, in the same transaction.
 -- A reused receipt ID is allowed only if the signed metadata is identical.
 INSERT INTO public.x1_audit_receipts(
  tenant_id,receipt_type,receipt_id,source_system,source_sha,content_hash,payload
 ) VALUES (
  e.tenant_id,'worker_execution',p_receipt_id,e.agent_id,q.source_sha,v_hash,
  pg_catalog.jsonb_build_object(
   'execution_id',e.execution_id,'work_id',q.work_id,
   'mission_id',q.mission_id,'work_packet_id',q.work_packet_id,
   'task_id',e.task_id,'agent_id',e.agent_id,'lease_id',e.lease_id,
   'attempt',e.attempt,'status','PASS')
 ) ON CONFLICT (tenant_id,receipt_type,receipt_id) DO NOTHING;
 SELECT * INTO v_stored FROM public.x1_audit_receipts
  WHERE tenant_id=e.tenant_id AND receipt_type='worker_execution'
    AND receipt_id=p_receipt_id;
 IF NOT FOUND OR v_stored.source_system IS DISTINCT FROM e.agent_id
 OR v_stored.source_sha IS DISTINCT FROM q.source_sha
 OR v_stored.content_hash IS DISTINCT FROM v_hash
 OR v_stored.payload->>'execution_id' IS DISTINCT FROM e.execution_id::text
 OR v_stored.payload->>'task_id' IS DISTINCT FROM e.task_id
 OR v_stored.payload->>'work_id' IS DISTINCT FROM q.work_id::text
 OR v_stored.payload->>'lease_id' IS DISTINCT FROM e.lease_id
 OR v_stored.payload->>'status' IS DISTINCT FROM 'PASS'
 THEN RAISE EXCEPTION 'EXECUTION_RECEIPT_COLLISION_OR_DRIFT'; END IF;
 IF e.state='ACTIVE' THEN
  UPDATE public.x1_task_leases
   SET status='COMPLETED',updated_at=pg_catalog.clock_timestamp()
   WHERE lease_id=e.lease_id AND status='ACTIVE'
     AND expires_at>pg_catalog.clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_LEASE_EXPIRED_DURING_COMMIT'; END IF;
  UPDATE public.x1_execution_ledger SET state='COMPLETED',
    receipt_id=p_receipt_id,completed_at=pg_catalog.clock_timestamp(),
    updated_at=pg_catalog.clock_timestamp()
    WHERE execution_id=e.execution_id AND state='ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_CONCURRENT_COMPLETION'; END IF;
 END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.x1_finish_work(
 p_work_id uuid,p_lease_id text,p_status text,p_error_code text DEFAULT NULL::text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
 q public.x1_work_queue%ROWTYPE;
 l public.x1_task_leases%ROWTYPE;
 e public.x1_execution_ledger%ROWTYPE;
 v_expected_hash text;
 v_matched integer;
BEGIN
 IF p_status NOT IN ('COMPLETED','FAILED','BLOCKED')
 THEN RAISE EXCEPTION 'WORK_FINISH_STATUS_INVALID'; END IF;
 SELECT * INTO q FROM public.x1_work_queue
  WHERE work_id=p_work_id AND lease_id=p_lease_id AND status='LEASED'
  FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORK_LEASE_CONTEXT_MISMATCH'; END IF;
 SELECT * INTO l FROM public.x1_task_leases
  WHERE lease_id=q.lease_id AND tenant_id=q.tenant_id
  AND task_id=q.task_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORK_LEASE_IDENTITY_MISMATCH'; END IF;

 IF p_status='COMPLETED' THEN
  IF l.status<>'COMPLETED' THEN
   RAISE EXCEPTION 'WORK_COMPLETION_EXECUTION_LEASE_NOT_COMPLETED'; END IF;
  SELECT * INTO e FROM public.x1_execution_ledger
   WHERE tenant_id=q.tenant_id AND lease_id=q.lease_id
     AND task_id=q.task_id AND agent_id=l.holder_agent_id
     AND state='COMPLETED' AND receipt_id IS NOT NULL
   FOR UPDATE;
  IF NOT FOUND OR e.completed_at IS NULL
    OR e.completed_at>l.expires_at
    OR e.attempt IS DISTINCT FROM q.attempts
    THEN RAISE EXCEPTION 'WORK_COMPLETION_EXECUTION_MISSING_OR_EXPIRED'; END IF;
  SELECT count(*) INTO v_matched FROM public.x1_execution_ledger
    WHERE tenant_id=q.tenant_id AND task_id=q.task_id
     AND lease_id=q.lease_id AND state='COMPLETED';
  IF v_matched<>1 THEN RAISE EXCEPTION 'WORK_COMPLETION_MULTIPLE_EXECUTIONS'; END IF;
  v_expected_hash:=pg_catalog.encode(extensions.digest(
    e.receipt_id||':'||e.execution_id::text||':'||e.task_id||':PASS',
    'sha256'),'hex');
  IF NOT EXISTS (
   SELECT 1 FROM public.x1_audit_receipts ar
   WHERE ar.tenant_id=q.tenant_id
   AND ar.receipt_type='worker_execution'
   AND ar.receipt_id=e.receipt_id
   AND ar.source_system=e.agent_id
   AND ar.source_sha IS NOT DISTINCT FROM q.source_sha
   AND ar.content_hash=v_expected_hash
   AND ar.payload->>'execution_id'=e.execution_id::text
   AND ar.payload->>'task_id'=e.task_id
   AND ar.payload->>'work_id'=q.work_id::text
   AND ar.payload->>'lease_id'=q.lease_id
   AND ar.payload->>'status'='PASS'
  ) THEN RAISE EXCEPTION 'WORK_COMPLETION_RECEIPT_NOT_VERIFIED'; END IF;
  IF q.payload->>'kind'='X1_PROMPT_TO_VERCEL_PREVIEW_V1' AND NOT EXISTS (
   SELECT 1 FROM public.x1_audit_receipts qa
   WHERE qa.tenant_id=q.tenant_id
    AND qa.receipt_type='X1_PREVIEW_INDEPENDENT_QA'
    AND qa.payload->>'work_id'=q.work_id::text
    AND qa.payload->>'source_sha'=q.source_sha
    AND qa.payload->>'status'='PASS'
    AND qa.payload->>'validator_id' IS NOT NULL
    AND qa.payload->>'validator_id'<>e.agent_id
    AND qa.payload->>'deployment_id'~'^dpl_[A-Za-z0-9]+$'
    AND qa.content_hash~'^[0-9a-f]{64}$'
  ) THEN RAISE EXCEPTION 'X1_INDEPENDENT_PREVIEW_QA_RECEIPT_REQUIRED'; END IF;
  UPDATE public.x1_work_queue
   SET status='COMPLETED',last_error_code=NULL,updated_at=pg_catalog.clock_timestamp()
   WHERE work_id=q.work_id AND lease_id=q.lease_id AND status='LEASED';
 ELSIF p_status='BLOCKED' THEN
  IF l.status<>'ACTIVE' OR l.expires_at<=pg_catalog.clock_timestamp()
  THEN RAISE EXCEPTION 'WORK_BLOCKED_LEASE_NOT_ACTIVE'; END IF;
  UPDATE public.x1_work_queue SET status='BLOCKED',last_error_code=p_error_code,
  updated_at=pg_catalog.clock_timestamp() WHERE work_id=q.work_id;
  UPDATE public.x1_task_leases SET status='RELEASED',
  updated_at=pg_catalog.clock_timestamp() WHERE lease_id=l.lease_id;
 ELSIF q.attempts>=q.max_attempts THEN
  IF l.status<>'ACTIVE' OR l.expires_at<=pg_catalog.clock_timestamp()
  THEN RAISE EXCEPTION 'WORK_FAILED_LEASE_NOT_ACTIVE'; END IF;
  UPDATE public.x1_work_queue SET status='DEAD_LETTER',last_error_code=p_error_code,
  updated_at=pg_catalog.clock_timestamp() WHERE work_id=q.work_id;
  UPDATE public.x1_task_leases SET status='FAILED',
  updated_at=pg_catalog.clock_timestamp() WHERE lease_id=l.lease_id;
 ELSE
  IF l.status<>'ACTIVE' OR l.expires_at<=pg_catalog.clock_timestamp()
  THEN RAISE EXCEPTION 'WORK_RETRY_LEASE_NOT_ACTIVE'; END IF;
  -- Mutating work may have partially written GitHub/Vercel. Never
  -- silently retry it under a new lease; require reconciliation.
  IF q.action_class<>'READ_ONLY' THEN
   UPDATE public.x1_work_queue SET status='BLOCKED',
    last_error_code='X1_MUTATION_OUTCOME_UNCERTAIN',
    updated_at=pg_catalog.clock_timestamp() WHERE work_id=q.work_id;
   UPDATE public.x1_task_leases SET status='RELEASED',
    updated_at=pg_catalog.clock_timestamp() WHERE lease_id=l.lease_id;
  ELSE
   UPDATE public.x1_work_queue SET status='PENDING',lease_id=NULL,
    last_error_code=p_error_code,
    available_at=pg_catalog.clock_timestamp()+pg_catalog.make_interval(
      secs=>pg_catalog.least(300,30*(2^pg_catalog.greatest(q.attempts-1,0)))),
    updated_at=pg_catalog.clock_timestamp() WHERE work_id=q.work_id;
   UPDATE public.x1_task_leases SET status='FAILED',
    updated_at=pg_catalog.clock_timestamp() WHERE lease_id=l.lease_id;
  END IF;
 END IF;
END
$function$;
COMMIT;
