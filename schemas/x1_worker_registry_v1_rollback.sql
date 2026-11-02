-- UNIVERSAL WORKER FABRIC v1 — Phase A rollback
-- Target: X1 AI Hub Staging only.
-- Safe rollback for Phase A before any worker rows are registered.
begin;

drop function if exists public.x1_assert_worker_identity(
  text, uuid, text, text, text, text, text, text
);

drop table if exists private.x1_worker_registry;

-- The private schema did not exist before Phase A. DROP SCHEMA without CASCADE
-- intentionally fails closed if any unexpected object has appeared in it.
drop schema if exists private;

commit;
