-- Universal Worker Fabric v1
-- Controller convergence + capability alignment rollback.
-- Restores only this mission's staging changes.

begin;

grant execute on function public.x1_lease_next_apex_work(uuid,text,text,integer,text,text[]) to service_role;
grant execute on function public.x1_lease_next_work_for_lane(uuid,text,text,text,integer) to service_role;
grant execute on function public.x1_lease_next_work_backup_20260926(uuid,text,text,integer) to service_role;

delete from public.x1_capability_registry
where tenant_id='666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid
  and mechanism='policy'
  and source='worker-fabric-v1-local-bridge'
  and capability_id in ('local-agent-request','local-control-plane-dispatch');

update private.x1_worker_registry
set metadata=metadata
    - 'controller_authority'
    - 'controller_convergence_version'
    - 'legacy_service_role_lease_paths_revoked'
    - 'capability_alignment_state'
    - 'operator_surface',
    enabled=false,
    updated_at=now()
where worker_id='jarvis-local-power-grid-1'
  and environment='preview';

update private.x1_worker_registry
set metadata=metadata
    - 'lease_hold'
    - 'controller_authority'
    - 'controller_convergence_version'
    - 'operator_surface',
    enabled=false,
    updated_at=now()
where worker_id='jarvis-local-ollama-1'
  and environment='preview';

delete from public.apex_continuity_state
where tenant_id='666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid
  and project_key='WORKER_FABRIC_V1'
  and latest_event_id='WORKERFABRIC-CONTROLLER-CONVERGENCE-20261003-001';

commit;
