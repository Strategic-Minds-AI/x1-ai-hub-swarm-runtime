# X1 | Source-controlled Gateway coding adapter + independent CI readback
Status: branch-only modules; disabled unless a separately verified approval receipt, sandbox binding and Gateway key are intentionally provided.

`src/gateway-coding-adapter.ts` emits scoped JSON file proposals via the official Vercel AI Gateway OpenAI-compatible endpoint `https://ai-gateway.vercel.sh/v1/chat/completions`. Its network call is gated behind `enabled=true`, scoped approval reference, server-side API key and bounded output tokens. No actual calls have been made by creating this code. Never place key in repo, frontend or X1 task payload. This adapter alone cannot enforce actual billed spend; external provider limits and approved budgets must be established.

`src/github-ci-validator.ts` independently fetches GitHub Actions workflow runs by exact immutable SHA, filters workflow identity and completed conclusion. It is read-only and returns PASS/FAIL/BLOCKED. Success does NOT certify browser interaction, voice fidelity, authorization or production release.

Future write adapter must require a signed, narrowly scoped branch-write grant from existing X1 authorization and a source-SHA lease, with exact allowed repo/branch/paths; never run on production branch. No live writer was implemented or activated in this packet.
Reference: https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions
