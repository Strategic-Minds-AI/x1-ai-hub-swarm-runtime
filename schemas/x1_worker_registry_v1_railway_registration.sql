-- UNIVERSAL WORKER FABRIC v1
-- Approved X1 Staging Railway worker registration.
-- No secret values are stored here.

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
  'x1-swarm-preview-1',
  '666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid,
  'railway',
  'preview',
  true,
  '1.0.0',
  '0000c9c755e46a440c713b939ef3d42a7562d05737199260f5ada04e5b93b837',
  'sha256:561f8ec04613f00fecb955e32de696a7e505ee949fc1c3f3063423e67b9f8544',
  'railway:x1-swarm-preview-1:existing-service-auth:v1',
  'BOUND',
  array['READ_ONLY']::text[],
  '["agent:smai:07-qa","agent:smai:09-heartbeat","agent:smai:13-digital-dominance","connector:supabase"]'::jsonb,
  jsonb_build_object(
    'stage_alias','staging',
    'railway_project_id','f442cf0a-7275-4c2b-bf73-2dda4254e002',
    'railway_service_id','b9c79ead-1edc-44b9-9823-98d37b20399e',
    'railway_environment_id','d4cd61a5-fe51-4eba-afb7-286267861734',
    'railway_deployment_id','9277acdc-f9db-4d3c-98e9-845ffa341362',
    'railway_snapshot_id','aa8b2675-56a9-4369-a14f-0d00fcc1ed2a',
    'source_repo','Strategic-Minds-AI/x1-ai-hub-swarm-runtime',
    'source_sha','4f845b6eefdaf718279fdf391598867ecabd686c',
    'binding_evidence_receipt','POWERGRID-RAILWAY-FAILOVER-20261003-001',
    'signed_authorization_exercised',true,
    'artifact_digest_basis','sha256(canonical Railway deployment descriptor)'
  )
);

commit;
