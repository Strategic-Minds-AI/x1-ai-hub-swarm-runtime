-- UNIVERSAL WORKER FABRIC v1
-- Roll back the dedicated worker-auth verifier layer.
-- Fails closed if unexpected rows exist.

begin;

do $guard$
declare
  v_count integer;
begin
  select count(*) into v_count from private.x1_worker_auth_hashes;
  if v_count > 1 then
    raise exception 'WORKER_AUTH_ROLLBACK_BLOCKED_UNEXPECTED_ROWS:%', v_count;
  end if;
end;
$guard$;

drop function if exists public.x1_match_worker_auth(text,text);
drop table if exists private.x1_worker_auth_hashes;

commit;
