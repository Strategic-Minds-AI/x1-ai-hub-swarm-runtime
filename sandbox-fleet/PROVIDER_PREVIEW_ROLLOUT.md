# Deterministic Sandbox Provider Rollout
**Verified inventory:** Existing Vercel `uacs-autonomous-sandbox` project; Website Launch Engine project currently returned zero named Vercel sandboxes; existing Railway Strategic Sandbox System, X1 staging and prod. Do not automatically create more platform projects.
**Billability:** Supabase preview branches create separate services and incur usage charges not covered by Spend Cap. Avoid creating a full Supabase branch for every client.
**Lifecycle:** REQUESTED -> LEASED -> BUILDING -> TESTING -> REPAIRING (bounded) -> VERIFIED -> ARCHIVED -> CLEANED. Return FAIL/QUARANTINED when necessary.
**Provider adapter contract:** create only inside exact account/project/tenant/namespace from approved envelope; return provider-native resource ID, cost quote/receipt, source SHA, and ownership tag. Validate those fields independently before any modification or cleanup.
**Deletion:** Garbage collector operates only on owned sandbox resources after versioned artifact archive receipt and TTL expiration. Unknown IDs or labels cause QUARANTINE, never forced deletion. Keep final build SHA and audit records even when compute is destroyed.
**Autonomy:** Fast fail closed on auth and budget errors. Transient failures get exponential backoff within lease and at most 3 attempts; no repeated provider account creation when quota exhausted.
**Staging activation:** guarded adapter + synthetic site + GitHub branch SHA + Vercel preview + Playwright 1440x900 / 390x844 + synthetic lead stored + failure injection/repair + archive receipt + cleanup verification.
**Production gate:** no live spending, release, DNS, real client data/contact, secrets or permission changes without scoped explicit approval.
