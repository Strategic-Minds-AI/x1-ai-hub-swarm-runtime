import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  handleWleSyntheticPreview, renderWleSyntheticPreview,
  WLE_APPROVED_SOURCE_SHA, WLE_CANONICAL_VERCEL_PROJECT,
  WLE_STAGING_SUPABASE_URL, WLE_PREVIEW_KIND,
} from "../dist/wle-preview-adapter.js";
import {
  APPROVED_ROOFING_TEMPLATE_HTML, APPROVED_ROOFING_TEMPLATE_SHA256,
} from "../dist/wle-approved-roofing-template.js";

const tenantId = "666f23bf-61bd-4be0-b5cb-4872e04fad9b";
const workId = "11111111-2222-4333-8444-555555555555";
const workerId = "x1-swarm-preview-1";

function makeWork(patch={}) {
  const baseline = {
    work_id:workId, tenant_id:tenantId,
    work_packet_id:"WLE-PREVIEW-STAGING-TEST-001",
    task_id:"wle.preview.synthetic.roofing-canary",
    requested_by:"wle-test-operator",action_class:"NON_PRODUCTION_MUTATION",
    source_sha:WLE_APPROVED_SOURCE_SHA,
    required_capabilities:[{id:"wle-synthetic-preview-only",mechanism:"policy"}],
    approval_reference:"WLE-STAGING-SYNTHETIC-TEST-001",
    idempotency_key:"0".repeat(64), attempt:1,
    payload:{
      kind:WLE_PREVIEW_KIND,template_id:"roofing",market:"Pompano Beach, FL",
      release_mode:"preview",delivery_mode:"private_storage",site_quantity:1,
      synthetic:true,no_customer_data:true,no_spend:true,
      customer_outbound:false,requires_domain_purchase:false,
      external_mutation:true,expected_vercel_project_id:WLE_CANONICAL_VERCEL_PROJECT,
    },
    lease:{
      leaseId:"11111111-3333-4333-8333-555555555555",
      taskId:"wle.preview.synthetic.roofing-canary",
      holderAgentId:workerId,
      acquiredAt:"2026-10-11T21:20:00.000Z",
      expiresAt:"2026-10-11T21:25:00.000Z",
    },
  };
  return {
    ...baseline, ...patch,
    payload:{...baseline.payload,...(patch.payload??{})},
    lease:{...baseline.lease,...(patch.lease??{})},
  };
}
function makeConfig(patch={}){
  return {
    environment:"preview",systemTenantId:tenantId,workerId,
    supabaseUrl:WLE_STAGING_SUPABASE_URL,serviceRoleKey:"server-side-mock-secret-only",
    ...patch,
  };
}
const digest=(text)=>createHash("sha256").update(text).digest("hex");

test("approved template is immutable, fictional, noindex and premium full-page",()=>{
  assert.equal(digest(APPROVED_ROOFING_TEMPLATE_HTML),APPROVED_ROOFING_TEMPLATE_SHA256);
  assert.equal(APPROVED_ROOFING_TEMPLATE_SHA256,"92f9aa59e277d91fb53d3e5435db52a19dcf0a7f1921ffb5a972eeadf9902d82");
  assert.match(APPROVED_ROOFING_TEMPLATE_HTML,/name="robots" content="noindex,nofollow"/);
  assert.match(APPROVED_ROOFING_TEMPLATE_HTML,/NOT A REAL CONTRACTOR/);
  assert.match(APPROVED_ROOFING_TEMPLATE_HTML,/tel:\+17722090266/);
  assert.ok(APPROVED_ROOFING_TEMPLATE_HTML.length>10000);
});
test("deterministic generator yields only synthetically marked noindex HTML",()=>{
  const first=renderWleSyntheticPreview(makeWork());
  const second=renderWleSyntheticPreview(makeWork());
  assert.deepEqual(first,second);
  assert.equal(first.sha256,digest(first.html));
  assert.match(first.html,/WLE_PRIVATE_STAGING_PREVIEW_V1/);
  assert.match(first.html,/Pompano_Beach_FL/);
  assert.match(first.html,/noindex,nofollow/);
  assert.match(first.html,/NOT A REAL CONTRACTOR/);
  assert.ok(first.byteSize<131072);
});
test("exactly one private staging object persisted and independently read back",async()=>{
  const calls=[];let stored;
  const fakeFetch=async(url,options)=>{
    calls.push({url,method:options.method,headers:options.headers});
    if(options.method==="POST"){stored=options.body;return new Response("{}",{status:200})}
    if(options.method==="GET")return new Response(stored,{status:200});
    throw Error("Unexpected HTTP method");
  };
  const receipt=await handleWleSyntheticPreview(makeWork(),makeConfig({fetchImpl:fakeFetch}));
  assert.equal(calls.length,2);
  assert.deepEqual(calls.map((x)=>x.method),["POST","GET"]);
  assert.equal(calls[0].url,calls[1].url);
  assert.ok(calls[0].url.startsWith(WLE_STAGING_SUPABASE_URL+"/storage/v1/object/artifact-staging/wle-preview/"+tenantId+"/"+workId+"/index.html"));
  assert.equal(calls[0].headers["x-upsert"],"false");
  assert.equal(receipt.storage_verified,true);
  assert.equal(receipt.public_url,null);
  assert.equal(receipt.private,true);
  assert.equal(receipt.released,false);
  assert.equal(receipt.sha256,digest(stored));
  assert.equal(receipt.kind,"WLE_STAGING_PRIVATE_PREVIEW_V1");
  assert.equal(JSON.stringify(receipt).includes("server-side-mock-secret-only"),false);
});
test("same idempotency path returns success only if private stored bytes match",async()=>{
  const saved=renderWleSyntheticPreview(makeWork()).html;
  let posts=0;
  const fakeFetch=async(url,opts)=>{
    if(opts.method==="POST"){posts++;return new Response("duplicate",{status:409})}
    return new Response(saved,{status:200});
  };
  const r=await handleWleSyntheticPreview(makeWork(),makeConfig({fetchImpl:fakeFetch}));
  assert.equal(posts,1);
  assert.equal(r.sha256,digest(saved));
});
test("unconfirmed upload is NEVER reported as complete",async()=>{
  const fakeFetch=async(url,opts)=>opts.method==="POST"
    ?new Response("unavailable",{status:503})
    :new Response("not found",{status:404});
  await assert.rejects(
    ()=>handleWleSyntheticPreview(makeWork(),makeConfig({fetchImpl:fakeFetch})),
    /WLE_ARTIFACT_NOT_PERSISTENCE_VERIFIED_503/,
  );
});
test("existing object hash mismatch blocks acknowledgement",async()=>{
  const fakeFetch=async(url,opts)=>opts.method==="POST"
    ?new Response("conflict",{status:409})
    :new Response("different content",{status:200});
  await assert.rejects(
    ()=>handleWleSyntheticPreview(makeWork(),makeConfig({fetchImpl:fakeFetch})),
    /WLE_STORAGE_OBJECT_HASH_MISMATCH/,
  );
});
test("no network operation occurs for protected or invalid work",async(t)=>{
  const cases=[
    ["production action",{action_class:"PRODUCTION_RELEASE"},{},"WLE_ACTION_CLASS_DENIED"],
    ["read only misclassified",{action_class:"READ_ONLY"},{},"WLE_ACTION_CLASS_DENIED"],
    ["unexpected task id",{task_id:"x1.delete.database",lease:{taskId:"x1.delete.database"}},{},"WLE_TASK_NOT_ALLOWLISTED"],
    ["cross tenant",{tenant_id:"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"},{},"WLE_CROSS_TENANT_DENIED"],
    ["lease mismatch",{lease:{holderAgentId:"other-agent"}},{},"WLE_LEASE_MISMATCH"],
    ["wrong source",{source_sha:"b".repeat(40)},{},"WLE_SOURCE_NOT_APPROVED"],
    ["no action capability",{required_capabilities:[]},{},"WLE_CAPABILITY_MISSING"],
    ["no scope reference",{approval_reference:null},{},"WLE_SCOPED_APPROVAL_REFERENCE_REQUIRED"],
    ["wrong project",{payload:{expected_vercel_project_id:"prj_fake"}},{},"WLE_VERCEL_PROJECT_MISMATCH"],
    ["public release",{payload:{release_mode:"production"}},{},"WLE_RELEASE_MODE_DENIED"],
    ["no private storage",{payload:{delivery_mode:"vercel_production"}},{},"WLE_RELEASE_MODE_DENIED"],
    ["customer email",{payload:{customer_outbound:true}},{},"WLE_PROTECTED_ACTION_DENIED"],
    ["domain purchase",{payload:{requires_domain_purchase:true}},{},"WLE_PROTECTED_ACTION_DENIED"],
    ["unknown input field",{payload:{customer_email:"none@example.invalid"}},{},"WLE_UNEXPECTED_PAYLOAD_FIELD"],
    ["wrong market",{payload:{market:"Miami, FL"}},{},"WLE_MARKET_NOT_APPROVED"],
    ["wrong industry",{payload:{template_id:"legal"}},{},"WLE_TEMPLATE_NOT_APPROVED"],
    ["batch size",{payload:{site_quantity:100}},{},"WLE_SITE_QUANTITY_DENIED"],
    ["not synthetic",{payload:{synthetic:false}},{},"WLE_SYNTHETIC_GUARD_REQUIRED"],
    ["cost",{payload:{no_spend:false}},{},"WLE_SYNTHETIC_GUARD_REQUIRED"],
    ["mutation disguised",{payload:{external_mutation:false}},{},"WLE_MUTATION_MISCLASSIFIED"],
    ["production runtime",{}, {environment:"production"},"WLE_PREVIEW_ENVIRONMENT_REQUIRED"],
    ["development runtime",{}, {environment:"development"},"WLE_PREVIEW_ENVIRONMENT_REQUIRED"],
    ["production supabase",{}, {supabaseUrl:"https://vgsmyhqqtkkluhypxyua.supabase.co"},"WLE_STAGING_SUPABASE_ONLY"],
    ["missing credentials",{}, {serviceRoleKey:""},"WLE_SERVER_CREDENTIAL_REQUIRED"],
    ["too large timeout",{}, {timeoutMs:60000},"WLE_TIMEOUT_BOUNDS_INVALID"],
  ];
  for(const [name,workPatch,cfgPatch,code] of cases){
    await t.test(name,async()=>{
      let networkCalls=0;
      const fakeFetch=async()=>{networkCalls++;throw Error("NETWORK_MUST_NOT_BE_CALLED")};
      await assert.rejects(
        ()=>handleWleSyntheticPreview(makeWork(workPatch),makeConfig({...cfgPatch,fetchImpl:fakeFetch})),
        (err)=>err instanceof Error && err.message===code,
      );
      assert.equal(networkCalls,0);
    });
  }
});
