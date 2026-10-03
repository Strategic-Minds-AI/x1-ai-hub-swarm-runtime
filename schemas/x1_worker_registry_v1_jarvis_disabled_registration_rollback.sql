-- UNIVERSAL WORKER FABRIC v1
-- JARVIS disabled/unbound staging registration rollback.
-- Removes only the exact disabled identity created by the approved registration.

begin;

delete from private.x1_worker_registry
where worker_id = 'jarvis-local-power-grid-1'
  and identity_fingerprint = '0efd360e0b0fc33bc40ac42a395f9ffc75e224bc6d391e9ee081840f053e81b7'
  and enabled = false
  and credential_binding_state = 'UNBOUND';

do $rollback$
begin
  if exists (
    select 1 from private.x1_worker_registry
    where worker_id='jarvis-local-power-grid-1'
      and identity_fingerprint='0efd360e0b0fc33bc40ac42a395f9ffc75e224bc6d391e9ee081840f053e81b7'
  ) then
    raise exception 'JARVIS_DISABLED_REGISTRATION_ROLLBACK_FAILED';
  end if;
end;
$rollback$;

commit;
