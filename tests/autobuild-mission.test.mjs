import {test} from "node:test";import {strict as assert} from "node:assert";
import {nextEligibleTasks} from "../dist/autobuild-mission.js";
const tasks=[
 {id:"X1-001",dependsOn:[],kind:"READ_ONLY"},
 {id:"X1-002",dependsOn:["X1-001"],kind:"NON_PRODUCTION_MUTATION"},
 {id:"X1-003",dependsOn:["X1-002"],kind:"PRODUCTION_RELEASE",approvalReference:"APPROVAL_REQUIRED"},
];
test("advances safe tasks from persisted completion facts",()=>{
 assert.deepEqual(nextEligibleTasks({tasks,completed:[],leased:[],failed:[]}).ready,["X1-001"]);
 assert.deepEqual(nextEligibleTasks({tasks,completed:["X1-001"],leased:[],failed:[]}).ready,["X1-002"]);
 const done=nextEligibleTasks({tasks,completed:["X1-001","X1-002"],leased:[],failed:[]});
 assert.deepEqual(done.protected,["X1-003"]);assert.deepEqual(done.ready,[]);
});
test("does not release downstream after a failed prerequisite",()=>{
 const out=nextEligibleTasks({tasks,completed:["X1-001"],leased:[],failed:["X1-002"]});
 assert.equal(out.blocked.find(t=>t.id==="X1-003").reason,"DEPENDENCY_FAILED");
});
test("rejects unknown dependencies and duplicates",()=>{
 assert.throws(()=>nextEligibleTasks({tasks:[...tasks,{id:"X1-002",dependsOn:[],kind:"READ_ONLY"}],completed:[],leased:[],failed:[]}),/DUPLICATE/);
 assert.throws(()=>nextEligibleTasks({tasks:[{id:"X1-123",dependsOn:["X1-GHOST"],kind:"READ_ONLY"}],completed:[],leased:[],failed:[]}),/DEPENDENCY/);
});
