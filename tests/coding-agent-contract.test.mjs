import { test } from "node:test";
import { strict as assert } from "node:assert";
import { normalizeCodingWorkPacket } from "../dist/coding-agent-contract.js";
const good=()=>({
 work_id:"work",mission_id:"X1-AVATAR-STUDIO-20261011",work_packet_id:"WP-X1-AVATAR-001",
 task_id:"WP-X1-AVATAR-001",tenant_id:"tenant",requested_by:"operator",
 action_class:"NON_PRODUCTION_MUTATION",required_capabilities:[],
 payload:{kind:"X1_CODING_AGENT_V1",repo:"Strategic-Minds-AI/X1-OPERATING-SYSTEM",
 branch:"feature/x1-avatar-studio-foundation-20261011",objective:"Add tenant-safe read-only adapter",
 allowed_paths:["src/app/api/health/route.ts","tests/architecture.test.mjs"],
 validation:["typecheck","independent_review"]},source_sha:"a".repeat(40),
 idempotency_key:"b".repeat(64),attempt:1,lease:{leaseId:"l",taskId:"t",holderAgentId:"worker",acquiredAt:"2026-10-11T00:00:00Z",expiresAt:"2099-10-11T00:00:00Z"}
});
test("prepares only dry-run branch coding packet",()=>{
 const p=normalizeCodingWorkPacket(good());
 assert.equal(p.dryRun,true);
 assert.equal(p.requireIndependentValidation,true);
 assert.equal(p.repo,"Strategic-Minds-AI/X1-OPERATING-SYSTEM");
 assert.ok(p.prohibited.includes("production_deploy"));
});
test("rejects production mutations",()=>{
 assert.throws(()=>normalizeCodingWorkPacket({...good(),action_class:"PRODUCTION_RELEASE"}),/X1_CODING_ACTION_CLASS_BLOCKED/);
});
test("rejects main branch",()=>{
 const w=good();w.payload.branch="main";assert.throws(()=>normalizeCodingWorkPacket(w),/X1_CODING_BRANCH_BLOCKED/);
});
test("rejects other repositories",()=>{
 const w=good();w.payload.repo="Strategic-Minds-AI/x1-ai-hub";assert.throws(()=>normalizeCodingWorkPacket(w),/X1_CODING_REPO_NOT_AUTHORIZED/);
});
test("rejects path escaping and workflow mutation",()=>{
 const w=good();w.payload.allowed_paths=["../../secrets"];assert.throws(()=>normalizeCodingWorkPacket(w),/X1_CODING_PATH_FORBIDDEN/);
 const y=good();y.payload.allowed_paths=[".github/workflows/ship.yml"];assert.throws(()=>normalizeCodingWorkPacket(y),/X1_CODING_PATH_FORBIDDEN/);
});
test("rejects request to spend or deploy",()=>{
 const w=good();w.payload.budget_usd=10;assert.throws(()=>normalizeCodingWorkPacket(w),/X1_CODING_PROTECTED_ACTION_BLOCKED/);
});
