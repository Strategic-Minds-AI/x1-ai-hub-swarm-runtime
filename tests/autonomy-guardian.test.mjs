import test from "node:test";
import assert from "node:assert/strict";
import { classifyBlocker, decideBlocker } from "../dist/blocker-breaker.js";
import { validateGuardian } from "../dist/guardian-validator.js";

test("blocker breaker classifies transient provider failure and backs off",()=>{
  assert.equal(classifyBlocker("HTTP_503_PROVIDER_OUTAGE"),"PROVIDER_OUTAGE");
  const out=decideBlocker({code:"HTTP_503_PROVIDER_OUTAGE",attempts:1,maxAttempts:3});
  assert.equal(out.disposition,"RETRY_TRANSIENT");
  assert.equal(out.retryDelayMs,120000);
  assert.equal(out.continueUnrelated,true);
});

test("blocker breaker dead-letters an exhausted repeated failure",()=>{
  const out=decideBlocker({code:"TEST_FAILURE",attempts:3,maxAttempts:3});
  assert.equal(out.disposition,"DEAD_LETTER");
  assert.equal(out.exhausted,true);
});

test("blocker breaker selects an alternate without bypassing protection",()=>{
  const out=decideBlocker({code:"CONNECTOR_FAILURE",attempts:4,maxAttempts:3,alternateAvailable:true});
  assert.equal(out.disposition,"TRY_ALTERNATE_ROUTE");
  const protectedOut=decideBlocker({
    code:"CONNECTOR_FAILURE",
    attempts:0,
    maxAttempts:3,
    alternateAvailable:true,
    protectedAction:true,
  });
  assert.equal(protectedOut.disposition,"REQUIRE_APPROVAL");
});

test("guardian rejects self-certification",()=>{
  const out=validateGuardian({
    executorIdentity:"worker-a",
    validatorIdentity:"worker-a",
    checks:[{id:"build",status:"PASS",required:true,evidence:["ci:1"]}],
  });
  assert.equal(out.status,"FAIL");
  assert.ok(out.failures.includes("validator_not_independent"));
});

test("guardian never converts missing evidence to pass",()=>{
  const out=validateGuardian({
    executorIdentity:"worker-a",
    validatorIdentity:"guardian-b",
    checks:[{id:"build",status:"PASS",required:true,evidence:[]}],
  });
  assert.equal(out.status,"UNKNOWN");
  assert.equal(out.score,0);
});

test("guardian returns system-100 only when every required check passes with evidence",()=>{
  const out=validateGuardian({
    executorIdentity:"worker-a",
    validatorIdentity:"guardian-b",
    checks:[
      {id:"queue",status:"PASS",required:true,evidence:["queue:healthy"]},
      {id:"lease",status:"PASS",required:true,evidence:["lease:healthy"]},
      {id:"rollback",status:"PASS",required:true,evidence:["rollback:verified"]},
    ],
  });
  assert.equal(out.status,"PASS");
  assert.equal(out.score,100);
});
