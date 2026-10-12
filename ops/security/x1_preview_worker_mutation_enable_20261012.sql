-- STAGING PERMISSION ACTIVATION ONLY. NOT APPLIED.
-- Source: X1 AI Hub Swarm Preview Railway service x1-swarm-preview.
-- Preserve READ_ONLY processing until separate provider, independent-QA and
-- worker deployment evidence exists. No production worker or tenancy changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
DO $guard$
DECLARE
  v_worker private.x1_worker_registry%ROWTYPE;
  v_sha constant text := 'dd186b7de199f05998e5c69a41d8af1547e28eb2';
BEGIN
  SELECT * INTO v_worker FROM private.x1_worker_registry
   WHERE worker_id='x1-swarm-preview-1' FOR UPDATE;
  IF NOT FOUND OR v_worker.environment <> 'preview'
    OR v_worker.execution_plane <> 'railway'
    OR v_worker.enabled IS DISTINCT FROM true
    OR v_worker.credential_binding_state <> 'BOUND'
    OR v_worker.allowed_action_classes IS DISTINCT FROM ARRAY['READ_ONLY']::text[]
  THEN RAISE EXCEPTION 'X1_PREVIEW_WORKER_IDENTITY_OR_LEAST_PRIVILEGE_DRIFT'; END IF;

  -- Completion protections must be present in actual staging RPCs.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.pronamespace='public'::pg_catalog.regnamespace
    AND p.proname='x1_complete_execution'
    AND pg_catalog.strpos(pg_catalog.pg_get_functiondef(p.oid),'EXECUTION_LEASE_EXPIRED_OR_NOT_ACTIVE')>0)
  OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.pronamespace='public'::pg_catalog.regnamespace
    AND p.proname='x1_finish_work'
    AND pg_catalog.strpos(pg_catalog.pg_get_functiondef(p.oid),'WORK_COMPLETION_RECEIPT_NOT_VERIFIED')>0)
  THEN RAISE EXCEPTION 'X1_STAGING_COMPLETION_FENCES_MISSING'; END IF;

  -- Each independent probe must have a durable PASS receipt bound to
  -- EXACT original preview worker source SHA, verified provider identity
  -- and specific worker. These cannot be inferred from configured env names.
  IF NOT EXISTS (SELECT 1 FROM public.x1_audit_receipts a
     WHERE a.tenant_id=v_worker.tenant_id
       AND a.receipt_type='X1_PREVIEW_PROVIDER_BINDING_VERIFIED'
       AND a.source_sha=v_sha
       AND a.payload->>'worker_id'=v_worker.worker_id
       AND a.payload->>'status'='PASS')
  THEN RAISE EXCEPTION 'X1_PREVIEW_PROVIDER_BINDING_RECEIPT_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.x1_audit_receipts a
     WHERE a.tenant_id=v_worker.tenant_id
       AND a.receipt_type='X1_PREVIEW_QA_ENDPOINT_READY'
       AND a.source_sha=v_sha
       AND a.payload->>'worker_id'=v_worker.worker_id
       AND a.payload->>'status'='PASS'
       AND a.payload->>'validator_id' IS NOT NULL
       AND a.payload->>'validator_id'<>v_worker.worker_id)
  THEN RAISE EXCEPTION 'X1_INDEPENDENT_QA_VALIDATOR_RECEIPT_REQUIRED'; END IF;

  -- Never let existing unreviewed mutation packets execute upon cutover.
  IF EXISTS (SELECT 1 FROM public.x1_work_queue q
      WHERE q.tenant_id=v_worker.tenant_id AND q.status='PENDING'
        AND q.action_class='NON_PRODUCTION_MUTATION')
  THEN RAISE EXCEPTION 'X1_PENDING_MUTATION_REVIEW_REQUIRED'; END IF;

  UPDATE private.x1_worker_registry
   SET allowed_action_classes=ARRAY['READ_ONLY','NON_PRODUCTION_MUTATION']::text[],
       updated_at=pg_catalog.clock_timestamp()
   WHERE worker_id=v_worker.worker_id AND tenant_id=v_worker.tenant_id
     AND environment='preview' AND execution_plane='railway'
     AND allowed_action_classes=ARRAY['READ_ONLY']::text[];
  IF NOT FOUND THEN RAISE EXCEPTION 'X1_PREVIEW_WORKER_PERMISSION_UPDATE_FAILED'; END IF;
END $guard$;
COMMIT;
