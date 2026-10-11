import {test} from "node:test";import {strict as assert} from "node:assert";
import {createGatewayCodingProposer} from "../dist/gateway-coding-adapter.js";
const p={objective:"Create a scoped test",sourceSha:"a".repeat(40),repo:"Strategic-Minds-AI/X1-OPERATING-SYSTEM",branch:"feature/x1-avatar-studio-foundation-20261011",
 allowedPaths:["tests/safe.test.mjs"],validation:["test"],prohibited:["production_deploy"]};
test("no Gateway calls without explicit authorization",async()=>{
 let invoked=false;
 const fn=createGatewayCodingProposer({model:"openai/gpt-6",apiKey:"test-key",fetchImpl:async()=>{invoked=true;throw Error("should not call");}});
 await assert.rejects(()=>fn(p,[]),/DISABLED_OR_UNAUTHORIZED/);assert.equal(invoked,false);
});
test("authorized mocked Gateway proposal uses exact Vercel host and returns schema",async()=>{
 let requested="";
 const fn=createGatewayCodingProposer({model:"openai/gpt-6",apiKey:"test-only-key",authorizationReceiptId:"approval-rec-1",enabled:true,
 fetchImpl:async(url,init)=>{
 requested=url;const body=JSON.parse(init.body);assert.equal(body.model,"openai/gpt-6");assert.ok(body.messages[1].content.includes("tests/safe.test.mjs"));
 return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({summary:"draft",changes:[{path:"tests/safe.test.mjs",content:"test('ok',()=>{})",explanation:"test"}]})}}]})};
 }});
 const draft=await fn(p,[]);
 assert.equal(requested,"https://ai-gateway.vercel.sh/v1/chat/completions");assert.equal(draft.changes.length,1);
});
test("malformed mock reply blocks",async()=>{
 const fn=createGatewayCodingProposer({model:"openai/gpt-6",apiKey:"test",authorizationReceiptId:"rec",enabled:true,
 fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:"not JSON"}}]})})});
 await assert.rejects(()=>fn(p,[]),/NON_JSON/);
});
