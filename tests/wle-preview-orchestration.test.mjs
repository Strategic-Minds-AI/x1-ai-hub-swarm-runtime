import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, createHash } from "node:crypto";
import { InMemoryExecutionLedger, processNextWork } from "../dist/index.js";
import {
  assertWleSignedAuthorizationScope, handleWleSyntheticPreview,
  WLE_APPROVED_SOURCE_SHA, WLE_CANONICAL_VERCEL_PROJECT,
  WLE_STAGING_SUPABASE_URL, WLE_PREVIEW_KIND,
} from "../dist/wle-preview-adapter.js";

const CAP = "wle-synthetic-preview-only";
const TENANT = "666f23bf-61bd-4be0-b5cb-4872e04fad9b";
const AGENT = "x1-swarm-preview-1";
const WORK_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const TASK_ID = "wle.preview.synthetic.roofing-end-to-end";
const SIGNING_KEY = "local-e2e-signing-key-not-for-production";
const digest = (text) => createHash("sha256").update(text).digest("hex");

function canonicalize(v){
  if(Array.isArray(v)) return "[" + v.map(canonicalize).join(",") + "]";
  if(v && typeof v === "object")
    return "{" + Object.entries(v).sort(([a],[b])=>a.localeCompare(b))
      .map(([k,x]) => JSON.stringify(k)+":"+canonicalize(x)).join(",") + "}";
  return JSON.stringify(v);
}
function makeWork(){
  return {
    work_id:WORK_ID,tenant_id:TENANT,work_packet_id:"WLE-PREVIEW-STAGING-E2E-001",
    task_id:TASK_ID,requested_by:"staging-qa",
    action_class:"NON_PRODUCTION_MUTATION",
    required_capabilities:[{id:CAP,mechanism:"policy"}],
    payload:{
      kind:WLE_PREVIEW_KIND,template_id:"roofing",market:"Pompano Beach, FL",
      release_mode:"preview",delivery_mode:"private_storage",site_quantity:1,
      synthetic:true,no_customer_data:true,no_spend:true,
      customer_outbound:false,requires_domain_purchase:false,
      external_mutation:true,expected_vercel_project_id:WLE_CANONICAL_VERCEL_PROJECT,
    },
    source_sha:WLE_APPROVED_SOURCE_SHA,
    idempotency_key:"d".repeat(64),
    attempt:1,approval_reference:"WLE-STAGING-SYNTHETIC-E2E-001",
    lease:{
      leaseId:"11111111-2222-4333-8444-555555555555",
      taskId:TASK_ID,holderAgentId:AGENT,
      acquiredAt:new Date(Date.now()-10_000).toISOString(),
      expiresAt:new Date(Date.now()+180_000).toISOString(),
    },
  };
}
function signedAuthorization(work,{allowed=true,required=[CAP],resolved=[CAP],action=work.action_class}={}){
  const unsigned={
    authorization_id:"auth-wle-e2e",
    task_id:work.task_id,agent_id:AGENT,tenant_id:work.tenant_id,
    requested_action:action,
    capabilities_required:required,capabilities_resolved:resolved,
    capability_sources:Object.fromEntries(resolved.map(x=>[x,"x1-staging-registry"])),
    policy_version:"staging-policy-v1",registry_version:"staging-registry-v1",
    issued_at:new Date(Date.now()-2000).toISOString(),
    expires_at:new Date(Date.now()+120_000).toISOString(),
    allowed,blockers:allowed?[]:[{capabilityId:CAP,state:"MISSING",closure:"REQUIRES_APPROVAL",detail:"no grant"}],
    receipt_id:"capability-authorization-e2e",
  };
  return {
    ...unsigned,signature:{algorithm:"HMAC-SHA256",
      value:createHmac("sha256",SIGNING_KEY).update(canonicalize(unsigned)).digest("hex")},
  };
}
function setup({authOptions={},storageMode="success"}={}){
  const work=makeWork();
  const finishes=[], requests=[], queue=[];
  const ledger=new InMemoryExecutionLedger();
  let handlerCalls=0, signedCalls=0, stored;
  const fetchImpl=async(url,options)=>{
    requests.push({url,method:options.method});
    if(options.method==="POST"){
      stored=options.body;
      return new Response("{}",{status:200});
    }
    if(options.method==="GET"){
      return new Response(storageMode==="mismatch"?"tampered":stored,{status:200});
    }
    throw new Error("HTTP_METHOD_DENIED");
  };
  const config={
    queue:{
      leaseNextWork:async()=>{queue.push("lease");return work;},
      finishWork:async(_w,status,code)=>finishes.push({status,code}),
    },
    controlPlane:{requestMandatoryAuthorization:async(request)=>{
      signedCalls++;
      assert.equal(request.requestedAction,"NON_PRODUCTION_MUTATION");
      assert.deepEqual(request.requiredCapabilities,work.required_capabilities);
      return signedAuthorization(work,authOptions);
    }},
    bootstrapSigningKey:SIGNING_KEY,workerId:AGENT,
    ledgerFactory:()=>ledger,
    authorizationGuard:assertWleSignedAuthorizationScope,
    handler:async(w)=>{
      handlerCalls++;
      return handleWleSyntheticPreview(w,{
        environment:"preview",systemTenantId:TENANT,workerId:AGENT,
        supabaseUrl:WLE_STAGING_SUPABASE_URL,serviceRoleKey:"mock-server-side-key-without-real-access",
        fetchImpl,
      });
    },
  };
  return {work,config,finishes,requests,queue,ledger,
    handlerCalls:()=>handlerCalls,signedCalls:()=>signedCalls,body:()=>stored};
}

test("signed and scoped X1 authorization + lease + private Storage GET produces one durable completion",async()=>{
  const x=setup();
  const result=await processNextWork(x.config);
  assert.equal(result.status,"COMPLETED");
  assert.equal(x.signedCalls(),1);
  assert.equal(x.handlerCalls(),1);
  assert.deepEqual(x.requests.map(x=>x.method),["POST","GET"]);
  assert.deepEqual(x.finishes,[{status:"COMPLETED",code:undefined}]);
  assert.equal(result.output.private,true);
  assert.equal(result.output.noindex,true);
  assert.equal(result.output.public_url,null);
  assert.equal(result.output.released,false);
  assert.equal(result.output.sha256,digest(x.body()));
  assert.match(x.body(),/NOT A REAL CONTRACTOR/);
  assert.match(x.body(),/name="robots" content="noindex,nofollow"/);
  assert.equal(JSON.stringify(result).includes("mock-server-side-key"),false);
});
test("signed allowed authorization missing resolved WLE policy BLOCKS before ledger, handler or network",async()=>{
  const x=setup({authOptions:{resolved:[]}});
  const result=await processNextWork(x.config);
  assert.equal(result.status,"BLOCKED");
  assert.equal(result.code,"WLE_SIGNED_CAPABILITY_SCOPE_MISMATCH");
  assert.equal(x.handlerCalls(),0);
  assert.equal(x.requests.length,0);
  assert.deepEqual(x.finishes,[{status:"BLOCKED",code:"WLE_SIGNED_CAPABILITY_SCOPE_MISMATCH"}]);
});
test("signed allowed authorization for lesser required scope BLOCKS before side effects",async()=>{
  const x=setup({authOptions:{required:["connector:supabase"],resolved:["connector:supabase"]}});
  const result=await processNextWork(x.config);
  assert.equal(result.status,"BLOCKED");
  assert.equal(result.code,"WLE_SIGNED_CAPABILITY_SCOPE_MISMATCH");
  assert.equal(x.handlerCalls(),0);
  assert.equal(x.requests.length,0);
});
test("explicit denied authorization blocks original queue job, never claims or runs private writer",async()=>{
  const x=setup({authOptions:{allowed:false,required:[CAP],resolved:[]}});
  const result=await processNextWork(x.config);
  assert.equal(result.status,"BLOCKED");
  assert.equal(result.code,"CAPABILITY_BOOTSTRAP_BLOCKED");
  assert.deepEqual(x.finishes,[{status:"BLOCKED",code:"CAPABILITY_BOOTSTRAP_BLOCKED"}]);
  assert.equal(x.handlerCalls(),0);
  assert.equal(x.requests.length,0);
});
test("tampered signed action is denied by X1 signature-context guard, no private Storage call",async()=>{
  const x=setup({authOptions:{action:"READ_ONLY"}});
  const result=await processNextWork(x.config);
  assert.equal(result.status,"BLOCKED");
  assert.equal(result.code,"AUTHORIZATION_ACTION_MISMATCH");
  assert.equal(x.handlerCalls(),0);
  assert.equal(x.requests.length,0);
});
test("storage hash corruption fails original execution without a false COMPLETED transition",async()=>{
  const x=setup({storageMode:"mismatch"});
  const result=await processNextWork(x.config);
  assert.equal(result.status,"FAILED");
  assert.equal(result.code,"WLE_STORAGE_OBJECT_HASH_MISMATCH");
  assert.deepEqual(x.finishes,[{status:"FAILED",code:"WLE_STORAGE_OBJECT_HASH_MISMATCH"}]);
  assert.equal(x.requests.length,2);
  assert.equal(x.handlerCalls(),1);
});
test("an unsigned or malformed policy scope cannot activate WLE private writer",async()=>{
  const work=makeWork();
  const auth=signedAuthorization(work);
  const variants=[
    {...auth,capabilities_required:[]},
    {...auth,capabilities_resolved:[]},
    {...auth,blockers:[{capabilityId:CAP,state:"DENY"}]},
  ];
  for(const invalid of variants){
    assert.throws(
      ()=>assertWleSignedAuthorizationScope(work,invalid),
      /WLE_SIGNED_CAPABILITY_SCOPE_MISMATCH/,
    );
  }
});
test("non-WLE normal X1 work is not subject to WLE-specific policy guard",()=>{
  const work=makeWork();work.payload={purpose:"existing-read-only"};
  work.action_class="READ_ONLY";
  assert.doesNotThrow(()=>assertWleSignedAuthorizationScope(work,signedAuthorization(work,{required:[],resolved:[]})));
});
