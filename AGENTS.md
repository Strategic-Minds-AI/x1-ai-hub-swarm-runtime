# AGENTS.md - X1 Hub Repository Operating Contract

Read `REPO_MANIFEST.json` and `README.md` before changing files. Then load the canonical protocol schemas and the global X1 Hub Source Truth Constitution.

## Rules
- Work from an immutable source SHA.
- Use branch/sandbox/preview by default.
- No protected actions without explicit approval receipt.
- Never store secrets in Git.
- Every material change declares `changed_contracts[]` and `affected_repositories[]`.
- Update machine contracts and human docs together.
- Run the repo's required validation gates.
- Missing/stale evidence is UNKNOWN.
- Repair max 3 attempts, smallest reversible diff.
- Builder and validator are independent.
- Update continuity/receipt metadata before handoff.
