import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test, { mock } from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL = "https://example.supabase.co";
process.env.SUPABASE_CALLS_SERVICE_KEY = "test-service-key";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/supabase-leads") return { shortCircuit: true, url: new URL("../lib/supabase-leads.ts", import.meta.url).href };
    if (specifier === "@/lib/content-actuals-lock") return { shortCircuit: true, url: new URL("../lib/content-actuals-lock.ts", import.meta.url).href };
    return nextResolve(specifier, context);
  },
});
const { POST } = await import("../app/api/content/actuals-lock/route.ts");
const { NextRequest } = await import("next/server.js");
hooks.deregister();

const owner = "11111111-1111-4111-8111-111111111111";

test("actuals-lock rejects oversized request bodies before database access", async () => {
  let fetchCalls = 0;
  mock.method(globalThis, "fetch", async () => {
    fetchCalls += 1;
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  });
  const response = await POST(new NextRequest("http://localhost/api/content/actuals-lock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "acquire", owner, padding: "x".repeat(2_000) }),
  }));
  assert.equal(response.status, 413);
  assert.equal(fetchCalls, 0);
});

test("actuals-lock rejects fields outside the exact request contract", async () => {
  let fetchCalls = 0;
  mock.method(globalThis, "fetch", async () => {
    fetchCalls += 1;
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  });
  const response = await POST(new NextRequest("http://localhost/api/content/actuals-lock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "acquire", owner, extra: true }),
  }));
  assert.equal(response.status, 400);
  assert.equal(fetchCalls, 0);
});


test("actuals-lock executes acquire, contention, renewal, release, and expiry takeover", async () => {
  const ownerB = "22222222-2222-4222-8222-222222222222";
  let stored = null;
  mock.method(globalThis, "fetch", async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = init?.method || "GET";
    const headers = { "content-type": "application/json", "content-range": stored === null ? "*/0" : "0-0/1" };
    if (method === "GET") return new Response(JSON.stringify(stored === null ? [] : [{ value: stored }]), { status: 200, headers });
    const body = JSON.parse(String(init?.body || "{}"));
    if (method === "POST") {
      if (stored !== null) return new Response(JSON.stringify({ code: "23505" }), { status: 409, headers: { "content-type": "application/json" } });
      stored = body.value;
      return new Response(JSON.stringify([{ value: stored }]), { status: 201, headers: { "content-type": "application/json", "content-range": "0-0/1" } });
    }
    if (method === "PATCH") {
      const expected = url.searchParams.get("value")?.replace(/^eq\./, "") ?? "";
      if (stored !== expected) return new Response("[]", { status: 200, headers: { "content-type": "application/json", "content-range": "*/0" } });
      stored = body.value;
      return new Response(JSON.stringify([{ value: stored }]), { status: 200, headers: { "content-type": "application/json", "content-range": "0-0/1" } });
    }
    throw new Error(`unexpected method ${method}`);
  });
  const call = (action, requestOwner) => POST(new NextRequest("http://localhost/api/content/actuals-lock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, owner: requestOwner }),
  }));

  assert.equal((await call("acquire", owner)).status, 200);
  assert.equal((await call("acquire", ownerB)).status, 409);
  assert.equal((await call("acquire", owner)).status, 200);
  assert.equal((await call("release", owner)).status, 200);
  assert.equal((await call("acquire", ownerB)).status, 200);
});


test("actuals-lock reports an insertion race without retrying unsafely", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async (_input, init) => {
    calls += 1;
    if ((init?.method || "GET") === "GET") return new Response("[]", { status: 200, headers: { "content-type": "application/json", "content-range": "*/0" } });
    return new Response(JSON.stringify({ code: "23505" }), { status: 409, headers: { "content-type": "application/json" } });
  });
  const response = await POST(new NextRequest("http://localhost/api/content/actuals-lock", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "acquire", owner }),
  }));
  assert.equal(response.status, 409);
  assert.equal(calls, 2);
});

test("actuals-lock reports a stale compare-and-set race", async () => {
  const active = JSON.stringify({ owner, expires_at: "2099-09-05T12:30:00.000Z" });
  mock.method(globalThis, "fetch", async (_input, init) => {
    if ((init?.method || "GET") === "GET") return new Response(JSON.stringify([{ value: active }]), { status: 200, headers: { "content-type": "application/json", "content-range": "0-0/1" } });
    return new Response("[]", { status: 200, headers: { "content-type": "application/json", "content-range": "*/0" } });
  });
  const response = await POST(new NextRequest("http://localhost/api/content/actuals-lock", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "acquire", owner }),
  }));
  assert.equal(response.status, 409);
});


test("actuals-lock rejects duplicate JSON contract members before database access", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => { calls += 1; throw new Error("database should not be called"); });
  for (const body of [
    `{"action":"acquire","action":"release","owner":"${owner}"}`,
    `{"action":"acquire","owner":"${owner}","owner":"${owner}"}`,
    String.raw`{"\u0061ction":"acquire","owner":"${owner}"}`,
    String.raw`{"action":"acquire","\u0061ction":"release","owner":"${owner}"}`,
  ]) {
    const response = await POST(new NextRequest("http://localhost/api/content/actuals-lock", { method: "POST", headers: { "content-type": "application/json" }, body }));
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 0);
});
