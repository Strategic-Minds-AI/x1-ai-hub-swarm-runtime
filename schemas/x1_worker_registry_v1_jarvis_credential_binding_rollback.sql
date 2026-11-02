-- UNIVERSAL WORKER FABRIC v1
-- JARVIS staging credential binding rollback.
-- Metadata-only rollback: no credential verifier is stored in Git.

begin;

delete from private.x1_worker_auth_hashes
where service_name='project-zero-preview'
  and worker_id='jarvis-local-power-grid-1'
  and credential_id='jarvis:power-grid:staging:dedicated:v1';

update private.x1_worker_registry
set credential_id='jarvis:power-grid:staging:unbound:v1',
    credential_binding_state='UNBOUND',
    enabled=false,
    updated_at=now()
where worker_id='jarvis-local-power-grid-1'
  and enabled=false;

commit;
