import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test, { mock } from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL = "https://example.supabase.co";
process.env.SUPABASE_CALLS_SERVICE_KEY = "test-service-key";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/supabase-content") return { shortCircuit: true, url: new URL("../lib/supabase-content.ts", import.meta.url).href };
    if (specifier === "@/lib/content-item-validation") return { shortCircuit: true, url: new URL("../lib/content-item-validation.ts", import.meta.url).href };
    if (specifier === "@/lib/content-constants") return { shortCircuit: true, url: new URL("../lib/content-constants.ts", import.meta.url).href };
    if (specifier === "@/lib/messaging") return { shortCircuit: true, url: new URL("../lib/messaging.ts", import.meta.url).href };
    return nextResolve(specifier, context);
  },
});
const { PATCH, POST } = await import("../app/api/content/route.ts");
const { NextRequest } = await import("next/server.js");
hooks.deregister();

test("content PATCH uses updated_at as an optimistic compare-and-set token", async () => {
  const expected = "2099-09-05T12:00:00.000Z";
  let requestedUrl = "";
  let requestedBody = null;
  mock.method(globalThis, "fetch", async (input, init) => {
    requestedUrl = typeof input === "string" ? input : input.url;
    if ((init?.method || "GET") === "GET") {
      return new Response(JSON.stringify([{ updated_at: expected, meta: {} }]), { status: 200, headers: { "content-type": "application/json", "content-range": "0-0/1" } });
    }
    requestedBody = JSON.parse(String(init?.body || "{}"));
    const row = { id: "11111111-1111-4111-8111-111111111111", status: "posted", updated_at: requestedBody.updated_at };
    return new Response(JSON.stringify([row]), { status: 200, headers: { "content-type": "application/json", "content-range": "0-0/1" } });
  });

  const response = await PATCH(new NextRequest("http://localhost/api/content", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", expected_updated_at: expected, status: "posted" }),
  }));

  assert.equal(response.status, 200);
  assert.match(requestedUrl, /id=eq\.11111111-1111-4111-8111-111111111111/);
  assert.match(requestedUrl, /updated_at=eq\.2099-09-05T12%3A00%3A00\.000Z/);
  assert.equal("expected_updated_at" in requestedBody, false);
  assert.ok(Date.parse(requestedBody.updated_at) > Date.parse(expected));
});

test("content PATCH reports a stale-write conflict when CAS updates no row", async () => {
  mock.method(globalThis, "fetch", async (_input, init) => {
    if ((init?.method || "GET") === "GET") return new Response(JSON.stringify([{ updated_at: "2026-09-05T12:00:00.000Z", meta: {} }]), { status: 200, headers: { "content-type": "application/json", "content-range": "0-0/1" } });
    return new Response("[]", { status: 200, headers: { "content-type": "application/json", "content-range": "*/0" } });
  });
  const response = await PATCH(new NextRequest("http://localhost/api/content", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", expected_updated_at: "2026-09-05T12:00:00.000Z", status: "posted" }),
  }));
  assert.equal(response.status, 409);
});


test("tokenless content PATCH remains compatible while strictly advancing the stored revision", async () => {
  let stored = "2099-09-05T12:00:00.000Z";
  const issued = [];
  mock.method(Date, "now", () => Date.parse("2026-09-05T12:00:00.000Z"));
  mock.method(globalThis, "fetch", async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = init?.method || "GET";
    if (method === "GET") return new Response(JSON.stringify([{ updated_at: stored }]), { status: 200, headers: { "content-type": "application/json", "content-range": "0-0/1" } });
    const expected = url.searchParams.get("updated_at")?.replace(/^eq\./, "");
    if (expected !== stored) return new Response("[]", { status: 200, headers: { "content-type": "application/json", "content-range": "*/0" } });
    const body = JSON.parse(String(init?.body || "{}"));
    assert.ok(Date.parse(body.updated_at) > Date.parse(stored));
    stored = body.updated_at;
    issued.push(stored);
    return new Response(JSON.stringify([{ id: "11111111-1111-4111-8111-111111111111", status: "posted", updated_at: stored }]), { status: 200, headers: { "content-type": "application/json", "content-range": "0-0/1" } });
  });
  const request = () => PATCH(new NextRequest("http://localhost/api/content", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", status: "posted" }),
  }));
  assert.equal((await request()).status, 200);
  assert.equal((await request()).status, 200);
  assert.equal(new Set(issued).size, 2);
});


test("deterministic content create surfaces database identity conflicts as 409", async () => {
  mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ code: "23505", message: "duplicate key" }), { status: 409, headers: { "content-type": "application/json" } }));
  const response = await POST(new NextRequest("http://localhost/api/content", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", title: "Imported actual", category: "connection", status: "posted", platforms: ["youtube"] }),
  }));
  assert.equal(response.status, 409);
});
