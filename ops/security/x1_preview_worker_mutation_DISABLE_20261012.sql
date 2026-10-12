-- EMERGENCY LEAST PRIVILEGE ROLLBACK: restore READ_ONLY on exact X1
-- STAGING preview worker. Retain all work packets, leases and receipts.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
UPDATE private.x1_worker_registry
 SET allowed_action_classes=ARRAY['READ_ONLY']::text[],
     updated_at=pg_catalog.clock_timestamp()
 WHERE worker_id='x1-swarm-preview-1'
   AND environment='preview' AND execution_plane='railway'
   AND allowed_action_classes=ARRAY['READ_ONLY','NON_PRODUCTION_MUTATION']::text[];
COMMIT;
