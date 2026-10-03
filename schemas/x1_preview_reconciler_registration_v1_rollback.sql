begin;

delete from private.x1_worker_control_guard where worker_id='x1-preview-reconciler';
delete from private.x1_worker_registry where worker_id='x1-preview-reconciler';

commit;
