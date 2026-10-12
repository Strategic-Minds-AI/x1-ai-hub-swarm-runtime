-- X1 AI Hub STAGING ONLY: uvdkzsbjackpjvpoxtyk
-- Fix idempotent replay after x1_work_queue_fill_mission_id assigns mission_id,
-- and fail closed on cross-tenant/idempotency-key reuse.
-- Exact original function saved in sibling rollback file BEFORE activation.
-- No queue/cron/worker/tenant creation; no row rewrites or permission changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
BEGIN
  IF NOT EXISTS(
   SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='x1_enqueue_work'
     AND p.pronargs=1 AND p.prosecdef
     AND pg_get_functiondef(p.oid) LIKE '%v_existing_mission is distinct from nullif(p_work->>%'
  ) THEN RAISE EXCEPTION 'X1_ENQUEUE_PREFLIGHT_FUNCTION_DRIFT'; END IF;
  IF NOT EXISTS(
   SELECT 1 FROM pg_indexes
   WHERE schemaname='public' AND tablename='x1_work_queue'
     AND indexname='x1_work_queue_idempotency_key_key' AND indexdef LIKE '%UNIQUE INDEX%'
  ) THEN RAISE EXCEPTION 'X1_ENQUEUE_UNIQUE_INDEX_REQUIRED'; END IF;
  IF NOT EXISTS(
   SELECT 1 FROM pg_trigger t
   WHERE t.tgrelid='public.x1_work_queue'::regclass
     AND t.tgname='x1_work_queue_fill_mission_id' AND NOT t.tgisinternal
  ) THEN RAISE EXCEPTION 'X1_MISSION_TRIGGER_REQUIRED'; END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION public.x1_enqueue_work(p_work jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_stored public.x1_work_queue%rowtype;
  v_tenant_id uuid;
  v_payload jsonb;
  v_required jsonb;
  v_expected_mission text;
BEGIN
  IF p_work IS NULL OR jsonb_typeof(p_work)<>'object' OR
     nullif(btrim(p_work->>'tenant_id'),'') IS NULL THEN
    RAISE EXCEPTION 'X1_ENQUEUE_CONTEXT_REQUIRED';
  END IF;
  v_tenant_id:=(p_work->>'tenant_id')::uuid;
  v_payload:=coalesce(p_work->'payload','{}'::jsonb);
  v_required:=coalesce(p_work->'required_capabilities','[]'::jsonb);
  IF jsonb_typeof(v_payload)<>'object' OR jsonb_typeof(v_required)<>'array' THEN
    RAISE EXCEPTION 'X1_ENQUEUE_PAYLOAD_INVALID';
  END IF;
  v_expected_mission:=coalesce(
    nullif(btrim(p_work->>'mission_id'),''),
    nullif(btrim(v_payload->>'mission_id'),''),
    nullif(btrim(p_work->>'work_packet_id'),''),
    p_work->>'task_id'
  );
  -- This is the existing insert, made safe for a second concurrent caller.
  INSERT INTO public.x1_work_queue(
    tenant_id,mission_id,work_packet_id,task_id,requested_by,action_class,
    required_capabilities,payload,source_sha,idempotency_key,
    priority,available_at,max_attempts,approval_reference,
    validation_receipt_id,rollback_reference
  ) VALUES(
    v_tenant_id,nullif(p_work->>'mission_id',''),
    p_work->>'work_packet_id',p_work->>'task_id',p_work->>'requested_by',
    p_work->>'action_class',v_required,v_payload,
    nullif(p_work->>'source_sha',''),p_work->>'idempotency_key',
    coalesce((p_work->>'priority')::integer,100),
    coalesce((p_work->>'available_at')::timestamptz,now()),
    coalesce((p_work->>'max_attempts')::integer,3),
    nullif(p_work->>'approval_reference',''),
    nullif(p_work->>'validation_receipt_id',''),
    nullif(p_work->>'rollback_reference','')
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING work_id INTO v_id;

  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT q.* INTO v_stored FROM public.x1_work_queue q
  WHERE q.idempotency_key=p_work->>'idempotency_key';

  IF NOT FOUND THEN RAISE EXCEPTION 'X1_ENQUEUE_RACE_UNRESOLVED'; END IF;

  IF v_stored.tenant_id IS DISTINCT FROM v_tenant_id
     OR v_stored.task_id IS DISTINCT FROM p_work->>'task_id'
     OR v_stored.work_packet_id IS DISTINCT FROM p_work->>'work_packet_id'
     OR v_stored.mission_id IS DISTINCT FROM v_expected_mission
     OR v_stored.action_class IS DISTINCT FROM p_work->>'action_class'
     OR v_stored.required_capabilities IS DISTINCT FROM v_required
     OR v_stored.payload IS DISTINCT FROM v_payload
     OR v_stored.source_sha IS DISTINCT FROM nullif(p_work->>'source_sha','')
     OR v_stored.requested_by IS DISTINCT FROM p_work->>'requested_by'
  THEN RAISE EXCEPTION 'WORK_IDEMPOTENCY_CONFLICT'; END IF;

  RETURN v_stored.work_id;
END;
$function$;
COMMIT;
