import {test} from "node:test";
import {strict as assert} from "node:assert";
import {createHmac} from "node:crypto";
import {applyAuthorizedBranchWrite} from "../dist/github-branch-writer.js";
const packet={
 packetId:"WP-X1-TEST-001",tenantId:"t-1",repo:"Strategic-Minds-AI/X1-OPERATING-SYSTEM",
 branch:"feature/x1-test",sourceSha:"a".repeat(40),allowedPaths:["tests/safe.test.mjs"],dryRun:true,
};
const proposal={summary:"test",changes:[{path:"tests/safe.test.mjs",content:"export const ok=true;",explanation:"test"}]};
function grant(){
 const g={grantId:"grant-test",action:"BRANCH_WRITE",tenantId:"t-1",packetId:"WP-X1-TEST-001",
 repo:packet.repo,branch:packet.branch,expectedSha:packet.sourceSha,expiresAt:"2099-01-01T00:00:00Z",
 allowedPaths:packet.allowedPaths};
 const signable=JSON.stringify([g.grantId,g.action,g.tenantId,g.packetId,g.repo,g.branch,g.expectedSha,g.expiresAt,g.allowedPaths]);
 return {...g,signature:createHmac("sha256","unit-only-secret").update(signable).digest("hex")};
}
test("refuses to perform GitHub writes without activation",async()=>{
 let calls=0;
 await assert.rejects(()=>applyAuthorizedBranchWrite(packet,proposal,grant(),
 {githubToken:"test",grantSigningKey:"unit-only-secret",fetchImpl:async()=>{calls++;return {}}}),/WRITER_DISABLED/);
 assert.equal(calls,0);
});
test("requires valid independently signed branch grant",async()=>{
 const g=grant();g.signature="0".repeat(64);
 await assert.rejects(()=>applyAuthorizedBranchWrite(packet,proposal,g,{enabled:true,githubToken:"unit",grantSigningKey:"unit-only-secret"}),/SIGNATURE_INVALID/);
});
test("only writes to exact isolated branch at immutable source SHA",async()=>{
 const paths=[],A="a".repeat(40),B="b".repeat(40),C="c".repeat(40),D="d".repeat(40);
 const fetchImpl=async(url,init)=>{
  paths.push({url,method:init.method});
  let obj={};
  if(init.method==="GET"&&url.includes("/git/ref/"))obj={object:{sha:A}};
  if(init.method==="GET"&&url.includes("/git/commits/"))obj={tree:{sha:B}};
  if(init.method==="POST"&&url.endsWith("/git/trees"))obj={sha:C};
  if(init.method==="POST"&&url.endsWith("/git/commits"))obj={sha:D};
  if(init.method==="PATCH"&&url.includes("/git/refs/")){assert.equal(JSON.parse(init.body).force,false);obj={object:{sha:D}};}
  return {ok:true,json:async()=>obj};
 };
 const result=await applyAuthorizedBranchWrite(packet,proposal,grant(),{enabled:true,githubToken:"unit",
  grantSigningKey:"unit-only-secret",fetchImpl});
 assert.equal(result.commitSha,D);assert.equal(paths.length,5);assert.ok(paths.every(p=>p.url.includes("/Strategic-Minds-AI/X1-OPERATING-SYSTEM/")));
});
test("source SHA conflict fails without writing",async()=>{
 let count=0;
 const fn=async()=>{count++;return {ok:true,json:async()=>({object:{sha:"f".repeat(40)}})}};
 await assert.rejects(()=>applyAuthorizedBranchWrite(packet,proposal,grant(),{enabled:true,githubToken:"unit",
  grantSigningKey:"unit-only-secret",fetchImpl:fn}),/SOURCE_SHA_DRIFT/);
 assert.equal(count,1);
});
