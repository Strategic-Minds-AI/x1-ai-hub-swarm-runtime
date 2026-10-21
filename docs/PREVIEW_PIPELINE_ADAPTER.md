# Preview pipeline adapter

Branch: `feat/preview-pipeline-adapter-20261021`. Nothing here is enabled, deployed or merged.

`src/preview-pipeline.ts` is the missing `NON_PRODUCTION_MUTATION` handler for the preview worker. It composes with, and does not weaken, the guards that already exist on the preview line:

| Gate | Enforced by | Refusal |
| --- | --- | --- |
| Feature | runtime must be preview, `preview_enabled` must be true, work must be NON_PRODUCTION_MUTATION on the system tenant, payload must be noindex preview | `PREVIEW_FEATURE_DISABLED`, `PREVIEW_ENV_NOT_PREVIEW`, `PREVIEW_ACTION_CLASS_UNSUPPORTED`, `PREVIEW_TENANT_MISMATCH`, `PREVIEW_NOINDEX_REQUIRED`, `PREVIEW_TARGET_NOT_PREVIEW` |
| Database fencing | payload must name the staging ref and must not reference the production ref anywhere | `PREVIEW_DB_REF_REQUIRED`, `PREVIEW_DB_REF_NOT_STAGING`, `PREVIEW_PRODUCTION_FENCE_VIOLATION` |
| Independent QA | a QA receipt is required, must be PASS, must not come from the worker or the requester, and must name the exact source SHA | `PREVIEW_QA_RECEIPT_MISSING`, `PREVIEW_QA_NOT_PASS`, `PREVIEW_QA_NOT_INDEPENDENT`, `PREVIEW_QA_SHA_MISMATCH` |
| Guardian | a Guardian receipt is required before deployment, must be independent and PASS | `PREVIEW_GUARDIAN_NOT_INDEPENDENT`, `PREVIEW_GUARDIAN_NOT_PASS` |
| Deployment | refused unless a staging deployment is explicitly authorized and a Guardian receipt exists | `PREVIEW_DEPLOY_NOT_AUTHORIZED` |

The handler produces the artifact packet (build manifest digest, source SHA, noindex flag, rollback reference, QA and Guardian receipt ids) and reports `PRODUCED_NOT_DEPLOYED`-equivalent status `PREPARED_NOT_DEPLOYED` until a staging deployment is authorized. `production_touched` is always false.

## What is still missing before a live preview
1. A launch-engine build manifest digest from a real build on the candidate SHA.
2. An independent QA receipt (`independent-cloud-browser-qa`) naming that SHA.
3. A Guardian `independent_validation` receipt naming that SHA and task.
4. An authorized staging preview deployment (host and credentials), which this branch does not create.
