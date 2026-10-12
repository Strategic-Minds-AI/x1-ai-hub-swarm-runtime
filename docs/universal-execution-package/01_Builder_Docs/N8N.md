# N8N

Optional existing adapter only. Export/import workflow metadata without secrets; scoped credentials remain in n8n. Every side effect uses idempotency and durable X1 receipt. Inapplicable if no n8n dependency.

Required per-project sections: immutable inputs; reused file/function/provider references; executable acceptance checks; evidence URI/hash; owner/independent validator; current PASS/FAIL/BLOCKED/UNKNOWN; rollback; next action. A document contract is not execution proof.
