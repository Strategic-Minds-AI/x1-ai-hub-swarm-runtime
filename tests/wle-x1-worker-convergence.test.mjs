import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertWleSignedAuthorizationScope, WLE_PREVIEW_KIND }
 from "../dist/wle-preview-adapter.js";
const src=readFileSync(new URL("../src/worker-main-gateway.ts",import.meta.url),"utf8");

test("one existing worker owns both independent preview workflows",()=>{
  assert.match(src,/handler:async\(work\)=>/);
  assert.match(src,/work\.payload\?\.kind===WLE_PREVIEW_KIND/);
  assert.match(src,/work\.payload\?\.kind===X1_PROMPT_PREVIEW_KIND/);
  assert.equal((src.match(/handler:async\(work\)=>/g)||[]).length,1);
});
test("WLE private writer requires both stage-only flag and the existing DB completion fence",()=>{
  assert.match(src,/process\.env\.WLE_PREVIEW_ADAPTER_ENABLED!=="true"/);
  assert.match(src,/process\.env\.X1_DB_COMPLETION_FENCING_PASS!=="true"/);
  assert.match(src,/environment!=="preview"/);
  assert.match(src,/WLE_PREVIEW_ADAPTER_DISABLED_OR_FENCING_UNVERIFIED/);
  assert.match(src,/authorizationGuard:[\s\S]*assertWleSignedAuthorizationScope\(work,authorization\)/);
  assert.match(src,/assertDdAuthorization\(work,authorization\)/);
});
test("generic prompt-preview mutation keeps its original independent QA/provider checks",()=>{
  assert.match(src,/assertIndependentQaConfig\(qaConfig,work\)/);
  assert.match(src,/requireIndependentQaProof\(work,build,qaConfig\)/);
  assert.match(src,/X1_GITHUB_PREVIEW_TOKEN/);
  assert.match(src,/X1_VERCEL_PREVIEW_TOKEN/);
  assert.ok(src.indexOf("work.payload?.kind===WLE_PREVIEW_KIND")
    <src.indexOf("work.payload?.kind===X1_PROMPT_PREVIEW_KIND"));
});
test("WLE requirement is a policy-scoped gate, not a generic mutation permission",()=>{
  assert.equal(WLE_PREVIEW_KIND,"WLE_SYNTHETIC_PREVIEW_BUILD_V1");
  const work={payload:{kind:WLE_PREVIEW_KIND},action_class:"NON_PRODUCTION_MUTATION",
    required_capabilities:[{id:"wle-synthetic-preview-only",mechanism:"policy"}]};
  assert.throws(()=>assertWleSignedAuthorizationScope(work,{
    capabilities_required:["connector:supabase"],capabilities_resolved:["connector:supabase"],
    blockers:[]
  }),/WLE_SIGNED_CAPABILITY_SCOPE_MISMATCH/);
});
