-- Universal Worker Fabric v1
-- Controller convergence + JARVIS capability alignment.
-- X1 AI Hub Staging only.
-- Canonical runtime lease authority: public.x1_lease_next_work.

begin;

-- Remove runtime access to legacy lease paths that bypass Phase B.
revoke execute on function public.x1_lease_next_apex_work(uuid,text,text,integer,text,text[])
  from public, anon, authenticated, service_role;
revoke execute on function public.x1_lease_next_work_for_lane(uuid,text,text,text,integer)
  from public, anon, authenticated, service_role;
revoke execute on function public.x1_lease_next_work_backup_20260926(uuid,text,text,integer)
  from public, anon, authenticated, service_role;

grant execute on function public.x1_lease_next_apex_work(uuid,text,text,integer,text,text[]) to postgres;
grant execute on function public.x1_lease_next_work_for_lane(uuid,text,text,text,integer) to postgres;
grant execute on function public.x1_lease_next_work_backup_20260926(uuid,text,text,integer) to postgres;

-- Register the two actual local bridge capabilities used by the JARVIS dispatcher.
insert into public.x1_capability_registry(
  tenant_id,capability_id,mechanism,available,authorized,fresh,validated,
  composable,platform_gated,impossible_by_skill,source,evidence,
  capability_version,last_verified_at,updated_at
) values
(
  '666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid,
  'local-agent-request',
  'policy',
  true,true,true,true,
  false,false,false,
  'worker-fabric-v1-local-bridge',
  jsonb_build_object(
    'worker_id','jarvis-local-power-grid-1',
    'execution_plane','jarvis-local',
    'source_repo','Strategic-Minds-AI/x1-ai-hub-swarm-runtime',
    'source_path','src/local-control-plane-dispatcher.ts',
    'artifact_source_sha','f1915a8890ec89641f66828a4abd0fb479a733c1',
    'artifact_digest','sha256:67f4d811b56a1fc6055c053b8c63104f314f9b8d042affb79c8fc823ee4d4d6d',
    'allowed_task_type','agent_request',
    'allowed_environment',jsonb_build_array('staging','preview'),
    'action_class','READ_ONLY',
    'validation','signed JARVIS canary previously completed through local control plane'
  ),
  'worker-fabric-local-bridge-1.0.0',
  now(),
  now()
),
(
  '666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid,
  'local-control-plane-dispatch',
  'policy',
  true,true,true,true,
  false,false,false,
  'worker-fabric-v1-local-bridge',
  jsonb_build_object(
    'worker_id','jarvis-local-power-grid-1',
    'execution_plane','jarvis-local',
    'source_repo','Strategic-Minds-AI/x1-ai-hub-swarm-runtime',
    'source_path','src/local-control-plane-dispatcher.ts',
    'artifact_source_sha','f1915a8890ec89641f66828a4abd0fb479a733c1',
    'artifact_digest','sha256:67f4d811b56a1fc6055c053b8c63104f314f9b8d042affb79c8fc823ee4d4d6d',
    'control_plane_binding','127.0.0.1:4311',
    'allowed_agents',jsonb_build_array('orchestrator','growth_operator','code_architect','social_strategist','sales_engine','brand_guardian','replicator','swarm','staging','validator'),
    'payload_firewall','secret-key pattern rejection + 64KiB + depth<=8',
    'action_class','READ_ONLY'
  ),
  'worker-fabric-local-bridge-1.0.0',
  now(),
  now()
)
on conflict (tenant_id,capability_id,mechanism)
do update set
  available=excluded.available,
  authorized=excluded.authorized,
  fresh=excluded.fresh,
  validated=excluded.validated,
  composable=excluded.composable,
  platform_gated=excluded.platform_gated,
  impossible_by_skill=excluded.impossible_by_skill,
  source=excluded.source,
  evidence=excluded.evidence,
  capability_version=excluded.capability_version,
  last_verified_at=excluded.last_verified_at,
  updated_at=now();

-- Normalize JARVIS allowlist and preserve the safety hold.
update private.x1_worker_registry
set allowed_capabilities='["agent:smai:07-qa","local-agent-request","local-control-plane-dispatch"]'::jsonb,
    enabled=false,
    metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'lease_hold',true,
      'controller_authority','public.x1_lease_next_work',
      'controller_convergence_version','worker-fabric-controller-v1',
      'legacy_service_role_lease_paths_revoked',true,
      'capability_alignment_state','ALIGNED_REGISTRY_AND_WORKER_ALLOWLIST',
      'operator_surface','APEX_CHATGPT_NON_SCHEDULER'
    ),
    updated_at=now()
where worker_id='jarvis-local-power-grid-1'
  and tenant_id='666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid
  and environment='preview';

-- Preserve the truth-only local Ollama registration and hold it until separate credential validation.
update private.x1_worker_registry
set enabled=false,
    metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'lease_hold',true,
      'controller_authority','public.x1_lease_next_work',
      'controller_convergence_version','worker-fabric-controller-v1',
      'operator_surface','APEX_CHATGPT_NON_SCHEDULER'
    ),
    updated_at=now()
where worker_id='jarvis-local-ollama-1'
  and tenant_id='666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid
  and environment='preview';

-- Durable controller source truth. This is additive and does not overwrite the older APEX continuity row.
insert into public.apex_continuity_state(
  tenant_id,project_key,latest_event_id,latest_run_id,latest_summary,
  unresolved_work,next_action,updated_at
) values (
  '666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid,
  'WORKER_FABRIC_V1',
  'WORKERFABRIC-CONTROLLER-CONVERGENCE-20261003-001',
  'WORKERFABRIC-CONTROLLER-CONVERGENCE-20261003-001',
  jsonb_build_object(
    'status','CONTROLLER_CONVERGED_STAGING',
    'canonical_lease_rpc','public.x1_lease_next_work',
    'canonical_claim_rpc','public.x1_claim_execution',
    'legacy_service_role_lease_paths_revoked',true,
    'jarvis_state','DISABLED_BOUND_HELD',
    'local_ollama_state','DISABLED_UNBOUND_HELD',
    'railway_state','ENABLED_BOUND',
    'operator_surface','APEX_CHATGPT_NON_SCHEDULER',
    'phase_b',true,
    'production_authority',false
  ),
  jsonb_build_array(
    jsonb_build_object('item','JARVIS_PHASE_B_HOLD_CONTROLLED_CANARY','state','PENDING_VALIDATION'),
    jsonb_build_object('item','LOCAL_OLLAMA_CREDENTIAL_BINDING','state','SEPARATE_APPROVAL_REQUIRED'),
    jsonb_build_object('item','CONCURRENT_CHAT_CONTROLLER_DEDUPLICATION','state','CONTAINED_BY_CANONICAL_LEASE_AUTHORITY')
  ),
  'Validate JARVIS local capabilities through project-zero-authorize while lease_hold remains active; then run one hold-controlled Phase B canary under a separate release step.',
  now()
)
on conflict (tenant_id,project_key)
do update set
  latest_event_id=excluded.latest_event_id,
  latest_run_id=excluded.latest_run_id,
  latest_summary=excluded.latest_summary,
  unresolved_work=excluded.unresolved_work,
  next_action=excluded.next_action,
  updated_at=now();

commit;
