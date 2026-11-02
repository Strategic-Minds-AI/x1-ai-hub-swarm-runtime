-- Universal Worker Fabric v1
-- Staging controller-guarded JARVIS failover + recovery test rollback.
-- Restores the exact approved pre-test control state.

begin;

update private.x1_worker_control_guard
set lease_allowed=true,
    reason='RAILWAY_CONTINUITY_ALLOWED',
    approval_reference='APPROVE X1 STAGING CONTROLLER-GUARDED JARVIS FAILOVER + RECOVERY TEST',
    updated_at=now()
where worker_id='x1-swarm-preview-1'
  and environment='preview';

update private.x1_worker_control_guard
set lease_allowed=false,
    reason='FAILOVER_RECOVERY_TEST_REHELD',
    approval_reference='APPROVE X1 STAGING CONTROLLER-GUARDED JARVIS FAILOVER + RECOVERY TEST',
    updated_at=now()
where worker_id='jarvis-local-power-grid-1'
  and environment='preview';

update private.x1_worker_registry
set enabled=false,
    metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'lease_hold',true,
      'lease_hold_reason','FAILOVER_RECOVERY_TEST_REHELD',
      'bridge_running',false,
      'container_running',false,
      'bridge_profile_enabled',false
    ),
    updated_at=now()
where worker_id='jarvis-local-power-grid-1'
  and environment='preview';

commit;
