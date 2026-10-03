-- UNIVERSAL WORKER FABRIC v1
-- Approved X1 Staging JARVIS registration.
-- Registration only: DISABLED + UNBOUND.
-- No credential value is stored or bound. No worker is started.

begin;

insert into private.x1_worker_registry (
  worker_id,
  tenant_id,
  execution_plane,
  environment,
  enabled,
  identity_version,
  identity_fingerprint,
  artifact_digest,
  credential_id,
  credential_binding_state,
  allowed_action_classes,
  allowed_capabilities,
  metadata
) values (
  'jarvis-local-power-grid-1',
  '666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid,
  'jarvis-local',
  'preview',
  false,
  'power-grid-bridge-image-v1',
  '0efd360e0b0fc33bc40ac42a395f9ffc75e224bc6d391e9ee081840f053e81b7',
  'sha256:63819e062080fa200d924a8a70eb4b867d2a59ea56f0255da8edf8a35fc194a1',
  'jarvis:power-grid:staging:unbound:v1',
  'UNBOUND',
  array['READ_ONLY']::text[],
  '["local-agent-request","local-control-plane-dispatch"]'::jsonb,
  jsonb_build_object(
    'stage_alias','staging',
    'device_name','JARVIS-COMMAND',
    'runtime','docker-desktop-linux-wsl2',
    'compose_project','strategic-minds-local-agents',
    'compose_service','power-grid-bridge',
    'container_name','sm-power-grid-bridge',
    'container_running',false,
    'docker_image','strategic-minds-local-agents-power-grid-bridge:latest',
    'docker_image_id','sha256:63819e062080fa200d924a8a70eb4b867d2a59ea56f0255da8edf8a35fc194a1',
    'image_created_at','2026-10-03T03:40:17.756179897Z',
    'bridge_profile','power-grid',
    'bridge_profile_enabled',false,
    'source_receipt','POWER_GRID_HARDENING_20261003.md',
    'credential_value_present',false,
    'requires_reattest_before_enable',true
  )
);

commit;
