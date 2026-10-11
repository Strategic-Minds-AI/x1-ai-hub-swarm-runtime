import {test} from "node:test";import {strict as assert} from "node:assert";
import {validateGitHubCI} from "../dist/github-ci-validator.js";
const base={repo:"Strategic-Minds-AI/X1-OPERATING-SYSTEM",commitSha:"a".repeat(40),workflowName:"X1 foundation checks",token:"scoped-test"};
test("accepts completed success for exact SHA only",async()=>{
 const data={workflow_runs:[{id:2,name:"X1 foundation checks",head_sha:"b".repeat(40),status:"completed",conclusion:"success",html_url:"wrong",event:"push"},
 {id:1,name:"X1 foundation checks",head_sha:"a".repeat(40),status:"completed",conclusion:"success",html_url:"https://github.com/example/run/1",event:"pull_request"}]};
 const x=await validateGitHubCI({...base,fetchImpl:async()=>({ok:true,json:async()=>data})});
 assert.equal(x.status,"PASS");assert.equal(x.runId,1);
});
test("fail closed if CI pending, missing or error",async()=>{
 const data={workflow_runs:[{id:3,name:"X1 foundation checks",head_sha:"a".repeat(40),status:"in_progress",conclusion:null,html_url:"pending",event:"pull_request"}]};
 const x=await validateGitHubCI({...base,fetchImpl:async()=>({ok:true,json:async()=>data})});assert.equal(x.status,"BLOCKED");
 const y=await validateGitHubCI({...base,fetchImpl:async()=>({ok:true,json:async()=>({workflow_runs:[]})})});assert.equal(y.status,"BLOCKED");
});
