-- UNIVERSAL WORKER FABRIC v1
-- JARVIS enable rollback. Staging only.
-- Safe fallback after the signed canary: disable JARVIS without touching Railway.

begin;

update private.x1_worker_registry
set enabled=false,
    updated_at=now()
where worker_id='jarvis-local-power-grid-1'
  and environment='preview'
  and execution_plane='jarvis-local';

commit;
