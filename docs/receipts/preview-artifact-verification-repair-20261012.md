# Preview artifact identity repair

changed_contracts: [X1PreviewProvider.verifyDeployed]
affected_repositories: [Strategic-Minds-AI/x1-ai-hub-swarm-runtime]
base_source_sha: a4c099f1dcd067287b5e57299dcb12bdd80e2443

The previous HTTP provider accepted READY without verifying the returned deployment's project or source metadata. The repair checks deployment ID, existing project ID, exact URL, Preview-only target/aliases, packet ID, source commit, HTML hash and release metadata before fetching public bytes. Missing/mismatched metadata fails closed. This builds on the current preview branch without changing its live ref.

Validation requires full npm test and independent CI on exact candidate. Regression probes cover wrong deployment/project/URL, production target/aliases, wrong packet/source/HTML/release metadata and absent metadata. No live provider write or activation occurs in these mocked tests.

Current staging deployment a3e7610f-6afb-46bc-b778-84892b1ad4fb uses dd186b7de199f05998e5c69a41d8af1547e28eb2. Required provider/independent-QA connection names remain absent from the preview service variable inventory. Fresh audit X1-STAGING-WORKER-DD186-PREVIEW-20261012-01 reports pending bindings. Real prompt-to-preview completion remains BLOCKED, not certified by source tests. This adapter consumes supplied HTML; it is not a model coding executor.

Next action: independently verify this branch candidate; bind existing scoped GitHub/Vercel/QA credentials through authorized credential custody, then run one synthetic real task. Preserve production, watched branch and rollback.
