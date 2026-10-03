-- UNIVERSAL WORKER FABRIC v1
-- Railway preview worker registration rollback.
-- Removes only the exact registered identity created by the approved staging registration.

begin;

delete from private.x1_worker_registry
where worker_id = 'x1-swarm-preview-1'
  and identity_fingerprint = '0000c9c755e46a440c713b939ef3d42a7562d05737199260f5ada04e5b93b837';

do $rollback$
begin
  if exists (
    select 1 from private.x1_worker_registry
    where worker_id='x1-swarm-preview-1'
      and identity_fingerprint='0000c9c755e46a440c713b939ef3d42a7562d05737199260f5ada04e5b93b837'
  ) then
    raise exception 'RAILWAY_REGISTRATION_ROLLBACK_FAILED';
  end if;
end;
$rollback$;

commit;
