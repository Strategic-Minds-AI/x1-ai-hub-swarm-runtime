begin;

drop function if exists public.x1_record_worker_heartbeat(text,uuid,text,text,text,text,text,jsonb);
drop table if exists public.x1_worker_heartbeats;
drop table if exists public.x1_incidents;

commit;
