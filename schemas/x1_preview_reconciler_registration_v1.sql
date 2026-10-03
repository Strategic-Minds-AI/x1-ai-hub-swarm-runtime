begin;

insert into private.x1_worker_registry(
  worker_id,tenant_id,execution_plane,environment,enabled,
  identity_version,identity_fingerprint,artifact_digest,credential_id,
  credential_binding_state,allowed_action_classes,allowed_capabilities,
  metadata,registered_at,updated_at
) values (
  'x1-preview-reconciler',
  '666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid,
  'cloud',
  'preview',
  true,
  'x1-preview-reconciler-v1',
  '33af346a133d7f90e765298f23136a427452a8567371eef3b12da7ac359d8afd',
  'sha256:2922fa27ad410838e17a5dbfe5acee4559bf074621b49b0eea90fbe3d432f0e9',
  'internal:service-role:reconciler:v1',
  'BOUND',
  array['READ_ONLY']::text[],
  '["connector:google-drive","connector:supabase"]'::jsonb,
  jsonb_build_object(
    'internal_service_only',true,
    'external_credential',false,
    'lease_hold',false,
    'purpose','x1_reconcile_tick'
  ),
  now(),
  now()
)
on conflict (worker_id) do update set
  tenant_id=excluded.tenant_id,
  execution_plane=excluded.execution_plane,
  environment=excluded.environment,
  enabled=excluded.enabled,
  identity_version=excluded.identity_version,
  identity_fingerprint=excluded.identity_fingerprint,
  artifact_digest=excluded.artifact_digest,
  credential_id=excluded.credential_id,
  credential_binding_state=excluded.credential_binding_state,
  allowed_action_classes=excluded.allowed_action_classes,
  allowed_capabilities=excluded.allowed_capabilities,
  metadata=excluded.metadata,
  updated_at=now();

insert into private.x1_worker_control_guard(
  worker_id,tenant_id,environment,execution_plane,
  controller_id,control_epoch,lease_allowed,approval_reference,
  reason,metadata,created_at,updated_at
) values (
  'x1-preview-reconciler',
  '666f23bf-61bd-4be0-b5cb-4872e04fad9b'::uuid,
  'preview',
  'cloud',
  'worker-fabric-controller-v1',
  'controller-convergence-20261003-v1',
  true,
  null,
  'Internal service-role reconciler; READ_ONLY queue work only.',
  jsonb_build_object('internal_service_only',true,'purpose','x1_reconcile_tick'),
  now(),
  now()
)
on conflict (worker_id) do update set
  tenant_id=excluded.tenant_id,
  environment=excluded.environment,
  execution_plane=excluded.execution_plane,
  controller_id=excluded.controller_id,
  control_epoch=excluded.control_epoch,
  lease_allowed=excluded.lease_allowed,
  approval_reference=excluded.approval_reference,
  reason=excluded.reason,
  metadata=excluded.metadata,
  updated_at=now();

commit;
