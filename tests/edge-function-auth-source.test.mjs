import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const db=readFileSync(new URL("../supabase/functions/project-zero-db-gateway/index.ts", import.meta.url),"utf8");
const auth=readFileSync(new URL("../supabase/functions/project-zero-authorize/index.ts", import.meta.url),"utf8");

for (const [name,source] of [["db-gateway",db],["authorize",auth]]) {
  test(`${name} parses Bearer credentials with a single whitespace escape`,()=>{
    assert.equal(source.includes("/^Bearer\\\\s+/i"),false,"double-escaped bearer regex would hash the prefix");
    assert.equal(source.includes("/^Bearer\\s+/i"),true,"expected single-backslash whitespace regex");
  });

  test(`${name} preserves legacy auth and adds worker credential fallback`,()=>{
    assert.equal(source.includes("x1_service_auth_hashes"),true);
    assert.equal(source.includes("x1_match_worker_auth"),true);
  });
}

test("db-gateway allowlists identity assertion RPC",()=>{
  assert.equal(db.includes('"x1_assert_worker_identity"'),true);
});
