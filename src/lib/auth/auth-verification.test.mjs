import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server.js";

function load(file, dependencies = {}) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require(name) {
      assert(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}
const errors = load("./errors.ts");
const roles = load("./roles.ts");

function harness(result, operatorResult = { data: { accessLevel: "owner", staffProfileId: null }, error: null }) {
  let signOuts = 0;
  const client = { auth: {
    getClaims: async () => result,
    signOut: async () => { signOuts++; },
  }, rpc: async (name) => {
    assert.equal(name, "get_my_operator_context");
    return operatorResult;
  } };
  const dependencies = {
    "@/lib/auth/errors": errors,
    "@/lib/auth/roles": roles,
    "@/lib/supabase/server": { createSupabaseServerClient: async () => client },
    "@/lib/supabase/env": { getSupabasePublicEnv: () => ({ url: "https://example.supabase.co", publishableKey: "test" }) },
    "@supabase/ssr": { createServerClient: () => client },
    "next/server": { NextResponse },
    "next/headers": { cookies: async () => ({ getAll: () => [{ name: "sb-test-auth-token", value: "preserved" }] }) },
    "next/navigation": { redirect: (url) => { throw new Error(url); } },
  };
  return {
    route: load("../../app/api/auth/role/route.ts", dependencies).POST,
    proxy: load("../supabase/proxy.ts", dependencies).updateSupabaseSession,
    requireUser: load("./require-auth.ts", dependencies).requireAuthenticatedUser,
    signOuts: () => signOuts,
  };
}

for (const error of [
  { name: "AuthRetryableFetchError", status: 0 },
  { name: "AuthApiError", status: 503 },
  { name: "AuthApiError", status: 429 },
]) {
  test(`Auth outage ${error.name}/${error.status}: no expiry, logout, or protected access`, async () => {
    const h = harness({ data: null, error });
    const response = await h.route(new Request("http://localhost/api/auth/role", { method: "POST" }));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const request = new NextRequest("http://localhost/operator/schedules", { headers: { cookie: "sb-test-auth-token=preserved" } });
    const redirected = await h.proxy(request);
    assert.equal(new URL(redirected.headers.get("location")).search, "?notice=auth-unavailable");
    assert.equal(request.cookies.get("sb-test-auth-token").value, "preserved");
    assert.equal(redirected.cookies.getAll().length, 0);
    await assert.rejects(h.requireUser("/login/operator", "operator"), /auth-unavailable/);
    assert.equal(h.signOuts(), 0);
  });
}

test("Invalid session still denies access with 401 and expired notice", async () => {
  const h = harness({ data: null, error: { name: "AuthInvalidJwtError", status: 400 } });
  assert.equal((await h.route(new Request("http://localhost/api/auth/role"))).status, 401);
  const response = await h.proxy(new NextRequest("http://localhost/operator/schedules", { headers: { cookie: "sb-test-auth-token=invalid" } }));
  assert.match(response.headers.get("location"), /notice=session-expired/);
  assert.equal(h.signOuts(), 1);
});

test("Verified role is accepted; wrong role is still denied", async () => {
  const h = harness({ data: { claims: { app_metadata: { role: "operator" } } }, error: null });
  for (const [expectedRole, status] of [["operator", 200], ["student", 403]]) {
    const request = new Request("http://localhost/api/auth/role", {
      method: "POST", body: JSON.stringify({ expectedRole }),
    });
    assert.equal((await h.route(request)).status, status);
  }
});

test("Disabled operator account is signed out and denied by route and proxy", async () => {
  const result = { data: { claims: { app_metadata: { role: "operator" } } }, error: null };
  const h = harness(result, { data: null, error: null });
  const routeResponse = await h.route(new Request("http://localhost/api/auth/role", {
    method: "POST", body: JSON.stringify({ expectedRole: "operator" }),
  }));
  assert.equal(routeResponse.status, 403);
  const proxyResponse = await h.proxy(new NextRequest("http://localhost/operator/schedules", { headers: { cookie: "sb-test-auth-token=disabled" } }));
  assert.match(proxyResponse.headers.get("location"), /notice=account-disabled/);
  assert.equal(h.signOuts(), 2);
});

test("Operator account lookup failure preserves the session and reports outage", async () => {
  const result = { data: { claims: { app_metadata: { role: "operator" } } }, error: null };
  const h = harness(result, { data: null, error: { code: "PGRST000" } });
  const response = await h.proxy(new NextRequest("http://localhost/operator/schedules", { headers: { cookie: "sb-test-auth-token=preserved" } }));
  assert.match(response.headers.get("location"), /notice=auth-unavailable/);
  assert.equal(h.signOuts(), 0);
});
