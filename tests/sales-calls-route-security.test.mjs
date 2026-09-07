import assert from "node:assert/strict";
import test from "node:test";
import { MutationInputError, parseSalesCallMutation, readBoundedJson, SALES_CALL_BODY_LIMIT } from "../lib/sales-call-mutation.ts";
import { registerHooks } from "node:module";

process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL = "https://example.supabase.co";
process.env.SUPABASE_CALLS_SERVICE_KEY = "test-key";
const root = new URL("../", import.meta.url);
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  if (specifier === "@/lib/sales-call-leads") return { url: new URL("lib/sales-call-leads.ts", root).href, shortCircuit: true };
  if (specifier === "@/lib/sales-call-mutation") return { url: new URL("lib/sales-call-mutation.ts", root).href, shortCircuit: true };
  if (specifier === "@/lib/sales-call-booked-view") return { url: new URL("lib/sales-call-booked-view.ts", root).href, shortCircuit: true };
  if (specifier === "@/lib/supabase-calls") return { url: new URL("lib/supabase-calls.ts", root).href, shortCircuit: true };
  return nextResolve(specifier, context);
}});
let handlers;
try { handlers = await import("../app/api/sales-calls/route.ts"); } finally { hooks.deregister(); }

function jsonRequest(method, value, headers = {}) {
  return new Request("http://localhost/api/sales-calls", { method, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(value) });
}

const validPost = (fields = {}) => ({ name: "Alex", objections: [], offer_made: false, ...fields });

test("POST route rejects unknown fields before contacting Supabase", async () => {
  let fetched = false; const original = globalThis.fetch; globalThis.fetch = async () => { fetched = true; throw new Error("must not fetch"); };
  try {
    const response = await handlers.POST(jsonRequest("POST", validPost({ admin: true })));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /unknown field/i);
    assert.equal(fetched, false);
  } finally { globalThis.fetch = original; }
});

test("PATCH route enforces exact result and follow-up status enums", async () => {
  for (const body of [{ id: "call-1", result: "Payment Received" }, { id: "call-1", follow_up_status: "hidden" }]) {
    const response = await handlers.PATCH(jsonRequest("PATCH", body));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /invalid/i);
  }
});

test("mutation routes reject bodies above the byte limit", async () => {
  const response = await handlers.POST(jsonRequest("POST", { name: "x".repeat(70_000) }));
  assert.equal(response.status, 413);
});


test("GET returns a generic bounded error and logs only safe backend metadata", async () => {
  const secret = "postgres://admin:super-secret@example.invalid";
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const logs = [];
  globalThis.fetch = async () => new Response(JSON.stringify({ message: secret, code: "DB_FAIL" }), { status: 500, headers: { "content-type": "application/json" } });
  console.error = (...items) => logs.push(items);
  try {
    const response = await handlers.GET();
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Unable to load sales calls" });
    assert.ok(logs.length > 0);
    assert.match(JSON.stringify(logs), /sales-calls.*list/i);
    assert.doesNotMatch(JSON.stringify(logs), /super-secret|postgres:\/\//i);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test("POST returns a generic error instead of a backend insert message", async () => {
  const secret = "service-role-secret-insert";
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const logs = [];
  globalThis.fetch = async () => new Response(JSON.stringify({ message: secret, code: "DB_INSERT" }), { status: 500, headers: { "content-type": "application/json" } });
  console.error = (...items) => logs.push(items);
  try {
    const response = await handlers.POST(jsonRequest("POST", validPost()));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Unable to create sales call" });
    assert.match(JSON.stringify(logs), /sales-calls.*create/i);
    assert.doesNotMatch(JSON.stringify(logs), /service-role-secret-insert/);
  } finally { globalThis.fetch = originalFetch; console.error = originalError; }
});

test("PATCH returns 404 when the requested sales call does not exist", async () => {
  const originalFetch = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (_input, init = {}) => {
    const method = init.method ?? "GET";
    if (method !== "GET") writes += 1;
    const accept = new Headers(init.headers).get("accept");
    if (accept?.includes("application/vnd.pgrst.object+json")) {
      return Response.json({
        code: "PGRST116",
        details: "The result contains 0 rows",
        hint: null,
        message: "JSON object requested, multiple (or no) rows returned",
      }, { status: 406 });
    }
    return Response.json([]);
  };
  try {
    const response = await handlers.PATCH(jsonRequest("PATCH", { id: "missing-call", result: "✅ Sale" }));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Sales call not found" });
    assert.equal(writes, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("PATCH read failures are generic server errors rather than leaked not-found details", async () => {
  const secret = "private-read-failure";
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const logs = [];
  globalThis.fetch = async () => new Response(JSON.stringify({ message: secret, code: "DB_READ" }), { status: 500, headers: { "content-type": "application/json" } });
  console.error = (...items) => logs.push(items);
  try {
    const response = await handlers.PATCH(jsonRequest("PATCH", { id: "call-1", result: "✅ Sale" }));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Unable to load sales call" });
    assert.match(JSON.stringify(logs), /sales-calls.*update-read/i);
    assert.doesNotMatch(JSON.stringify(logs), /private-read-failure/);
  } finally { globalThis.fetch = originalFetch; console.error = originalError; }
});

test("PATCH catches thrown backend read failures and returns a bounded observable error", async () => {
  const secret = "private-thrown-read-failure";
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const logs = [];
  globalThis.fetch = async () => { throw new Error(secret); };
  console.error = (...items) => logs.push(items);
  try {
    const response = await handlers.PATCH(jsonRequest("PATCH", { id: "call-1", result: "✅ Sale" }));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Unable to load sales call" });
    assert.match(JSON.stringify(logs), /sales-calls.*update-read/i);
    assert.doesNotMatch(JSON.stringify(logs), new RegExp(secret));
  } finally { globalThis.fetch = originalFetch; console.error = originalError; }
});

test("PATCH update failures return a generic client-safe error", async () => {
  const secret = "private-update-failure";
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const logs = [];
  const existing = { id: "call-1", name: "Alex", call_type: "📞 Sales Call", call_date: null, confirmed: null, result: null, showed: null, success: null, offer: null, deal_amount: null, follow_up_date: null, follow_up_notes: null };
  globalThis.fetch = async (input, init = {}) => {
    const method = init.method ?? (typeof input === "string" ? "GET" : input.method);
    if (method === "GET") return Response.json(existing);
    return new Response(JSON.stringify({ message: secret, code: "DB_UPDATE" }), { status: 500, headers: { "content-type": "application/json" } });
  };
  console.error = (...items) => logs.push(items);
  try {
    const response = await handlers.PATCH(jsonRequest("PATCH", { id: "call-1", result: "✅ Sale" }));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Unable to update sales call" });
    assert.match(JSON.stringify(logs), /sales-calls.*update-write/i);
    assert.doesNotMatch(JSON.stringify(logs), /private-update-failure/);
  } finally { globalThis.fetch = originalFetch; console.error = originalError; }
});

test("DELETE returns a generic error instead of a backend delete message", async () => {
  const secret = "private-delete-failure";
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const logs = [];
  globalThis.fetch = async () => new Response(JSON.stringify({ message: secret, code: "DB_DELETE" }), { status: 500, headers: { "content-type": "application/json" } });
  console.error = (...items) => logs.push(items);
  try {
    const response = await handlers.DELETE(jsonRequest("DELETE", { id: "call-1" }));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Unable to delete sales call" });
    assert.match(JSON.stringify(logs), /sales-calls.*delete/i);
    assert.doesNotMatch(JSON.stringify(logs), /private-delete-failure/);
  } finally { globalThis.fetch = originalFetch; console.error = originalError; }
});

test("DELETE uses the bounded duplicate-aware exact id contract before database access", async () => {
  const original = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => { fetched = true; throw new Error("must not fetch"); };
  const request = (bytes) => new Request("http://localhost/api/sales-calls", {
    method: "DELETE", headers: { "content-type": "application/json" }, body: bytes,
  });
  const cases = [
    [Buffer.alloc(SALES_CALL_BODY_LIMIT + 1, 0x20), 413],
    [Buffer.from([0x7b, 0x22, 0x69, 0x64, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]), 400],
    [Buffer.from('{"id":"one","id":"two"}'), 400],
    [Buffer.from('{"id":"one","\u0069d":"two"}'), 400],
    [Buffer.from('["call-1"]'), 400],
    [Buffer.from('{"id":"call-1","extra":true}'), 400],
    [Buffer.from('{"id":7}'), 400],
    [Buffer.from('{"id":""}'), 400],
    [Buffer.from(`{"id":"${"x".repeat(201)}"}`), 400],
  ];
  try {
    for (const [bytes, status] of cases) {
      const response = await handlers.DELETE(request(bytes));
      assert.equal(response.status, status);
      assert.equal(typeof (await response.json()).error, "string");
    }
    assert.equal(fetched, false);
  } finally { globalThis.fetch = original; }
});

test("lead-sync failures remain observable without exposing backend messages", async () => {
  const secret = "private-lead-query-failure";
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const logs = [];
  const existing = { id: "call-1", name: "Alex", email: "alex@example.com", phone: null, call_type: "📞 Sales Call", call_date: null, confirmed: null, result: null, showed: null, success: null, offer: null, deal_amount: null, follow_up_date: null, follow_up_notes: null };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = init.method ?? (typeof input === "string" ? "GET" : input.method);
    if (url.pathname.endsWith("/sales_calls") && method === "GET") return Response.json(existing);
    if (url.pathname.endsWith("/sales_calls") && method === "PATCH") return Response.json({ ...existing, result: "✅ Sale", showed: true, success: true });
    return new Response(JSON.stringify({ message: secret, code: "LEAD_QUERY" }), { status: 500, headers: { "content-type": "application/json" } });
  };
  console.error = (...items) => logs.push(items);
  try {
    const response = await handlers.PATCH(jsonRequest("PATCH", { id: "call-1", result: "✅ Sale", showed: true, success: true }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.leadSync, { status: "error", message: "Lead synchronization failed" });
    assert.match(JSON.stringify(logs), /sales-calls.*lead-sync/i);
    assert.doesNotMatch(JSON.stringify(logs), /private-lead-query-failure/);
  } finally { globalThis.fetch = originalFetch; console.error = originalError; }
});

test("lead matching stops at a hard candidate ceiling and fails closed", async () => {
  const original = globalThis.fetch;
  const existing = {
    id: "call-ceiling", name: "Alex", email: "%", phone: null, call_type: "📞 Sales Call",
    call_date: "2026-09-05T12:00:00Z", confirmed: "✅ Confirmed", result: null,
    showed: null, success: null, offer: null, deal_amount: null, follow_up_status: null,
    follow_up_date: null, follow_up_notes: null, call_notes: null, updated_at: "2026-09-06T12:00:00.000Z",
  };
  let emailPages = 0;
  let leadWrites = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = init.method ?? (typeof input === "string" ? "GET" : input.method);
    if (url.pathname.endsWith("/sales_calls") && method === "GET") return Response.json(existing);
    if (url.pathname.endsWith("/sales_calls") && method === "PATCH") return Response.json({ ...existing, result: "📣 Follow Up", showed: true, success: false });
    if (url.pathname.endsWith("/leads") && method === "PATCH") { leadWrites += 1; return Response.json([]); }
    if (url.pathname.endsWith("/leads") && url.searchParams.has("email")) {
      emailPages += 1;
      if (emailPages <= 5) return Response.json(Array.from({ length: 500 }, (_, index) => ({ id: `lead-${emailPages}-${index}`, email: `other-${emailPages}-${index}@example.com` })));
      return Response.json([]);
    }
    return Response.json([]);
  };
  try {
    const response = await handlers.PATCH(jsonRequest("PATCH", { id: existing.id, result: "📣 Follow Up", showed: true, success: false }));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).leadSync, { status: "error", message: "Lead synchronization failed" });
    assert.equal(emailPages, 4);
    assert.equal(leadWrites, 0);
  } finally { globalThis.fetch = original; }
});

test("PATCH route finds formatted-phone duplicates before exact-name fallback", async () => {
  const original = globalThis.fetch;
  const existing = { id: "call-1", name: "Alex Example", email: null, phone: "+1 (555) 111-2222", call_type: "📞 Sales Call", call_date: "2026-09-05T12:00:00Z", confirmed: "✅ Confirmed", result: null, showed: null, success: null, offer: null, deal_amount: null, follow_up_date: null, follow_up_notes: null };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = init.method ?? (typeof input === "string" ? "GET" : input.method);
    if (url.pathname.endsWith("/sales_calls") && method === "GET") return Response.json(existing);
    if (url.pathname.endsWith("/sales_calls") && method === "PATCH") return Response.json({ ...existing, result: "📣 Follow Up", showed: true, success: false });
    if (url.pathname.endsWith("/leads") && url.searchParams.get("phone")?.startsWith("ilike")) return Response.json([]);
    if (url.pathname.endsWith("/leads") && url.searchParams.has("phone")) return Response.json([{ id: "lead-phone-1", full_name: "One", phone: "+1 (555) 111-2222", prospect_stage: "📞 Call Booked", notes: null }, { id: "lead-phone-2", full_name: "Two", phone: "555.111.2222", prospect_stage: "📞 Call Booked", notes: null }]);
    if (url.pathname.endsWith("/leads") && url.searchParams.has("full_name")) return Response.json([{ id: "lead-name", full_name: "Alex Example", phone: null, prospect_stage: "📞 Call Booked", notes: null }]);
    if (url.pathname.endsWith("/leads") && method === "PATCH") return Response.json([{ id: "lead-name", prospect_stage: "🔥 Hot Prospect", notes: "changed" }]);
    return Response.json([]);
  };
  try {
    const response = await handlers.PATCH(jsonRequest("PATCH", { id: "call-1", result: "📣 Follow Up", showed: true, success: false }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.leadSync, { status: "ambiguous", method: "phone", count: 2 });
  } finally { globalThis.fetch = original; }
});


function rawRequest(bytes) {
  return new Request("http://localhost/api/sales-calls", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: bytes,
  });
}

async function rejectsInput(action, pattern, status = 400) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof MutationInputError);
    assert.equal(error.status, status);
    assert.match(error.message, pattern);
    return true;
  });
}

test("64 KiB parser accepts the exact byte bound and fatally rejects malformed UTF-8 or JSON", async () => {
  const prefix = Buffer.from('{"call_notes":"');
  const suffix = Buffer.from('"}');
  const exact = Buffer.concat([prefix, Buffer.alloc(SALES_CALL_BODY_LIMIT - prefix.length - suffix.length, 0x61), suffix]);
  assert.equal(exact.byteLength, SALES_CALL_BODY_LIMIT);
  const parsed = await readBoundedJson(rawRequest(exact));
  assert.equal(parsed.call_notes.length, SALES_CALL_BODY_LIMIT - prefix.length - suffix.length);

  await rejectsInput(() => readBoundedJson(rawRequest(Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]))), /UTF-8 JSON/);
  await rejectsInput(() => readBoundedJson(rawRequest(Buffer.from('{"name":', "utf8"))), /UTF-8 JSON/);
  await rejectsInput(() => readBoundedJson(rawRequest(Buffer.alloc(SALES_CALL_BODY_LIMIT + 1, 0x20))), /too large/, 413);
});

test("bounded JSON parsing rejects duplicate object members before JSON.parse loses them", async () => {
  for (const source of [
    '{"name":"first","name":"second","objections":[],"offer_made":false}',
    '{"name":"Alex","objections":[],"offer_made":false,"nested":{"x":1,"x":2}}',
    '{"name":"Alex","\u006eame":"second","objections":[],"offer_made":false}',
  ]) {
    await rejectsInput(() => readBoundedJson(rawRequest(Buffer.from(source))), /duplicate JSON member/i);
  }
});

test("POST requires every non-nullable field and PATCH rejects null for them", () => {
  for (const body of [
    {},
    { name: "Alex", objections: [] },
    { name: "Alex", offer_made: false },
    { objections: [], offer_made: false },
  ]) {
    assert.throws(() => parseSalesCallMutation(body, "POST"), /required/i);
  }

  for (const [field, value] of [
    ["name", null],
    ["objections", null],
    ["offer_made", null],
  ]) {
    assert.throws(
      () => parseSalesCallMutation({ id: "call-1", [field]: value }, "PATCH"),
      new RegExp(`Invalid ${field}`),
    );
  }

  assert.doesNotThrow(() => parseSalesCallMutation({ name: "Alex", objections: [], offer_made: false }, "POST"));
});

test("ordinary POST and PATCH reject reserved booked-view marker collisions in user notes", async () => {
  const collisions = [
    "[[salesos-booked-view:v1:n:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA]]",
    "prefix\n[[salesos-booked-view:not-valid]]\nsuffix",
    "[[SaLeSoS-BoOkEd-ViEw:anything]]",
    "［［ｓａｌｅｓｏｓ－ｂｏｏｋｅｄ－ｖｉｅｗ：anything］］",
  ];
  for (const field of ["call_notes", "follow_up_notes"]) {
    for (const collision of collisions) {
      for (const [method, body] of [
        ["POST", validPost({ [field]: collision })],
        ["PATCH", { id: "call-1", [field]: collision }],
      ]) {
        let fetched = false;
        const original = globalThis.fetch;
        globalThis.fetch = async () => { fetched = true; throw new Error("must not fetch"); };
        try {
          const response = await handlers[method](jsonRequest(method, body));
          assert.equal(response.status, 400, `${method} ${field}: ${collision}`);
          assert.match((await response.json()).error, new RegExp(`Invalid ${field}`));
          assert.equal(fetched, false);
        } finally { globalThis.fetch = original; }
      }
    }
  }
});

test("POST and PATCH mutation contracts enforce exact fields, enums, URLs, and bounds", () => {
  assert.throws(() => parseSalesCallMutation(validPost({ id: "server-id" }), "POST"), /Unknown field: id/);
  assert.throws(() => parseSalesCallMutation({ id: "call-1", created_at: "2026-09-06" }, "PATCH"), /Unknown field: created_at/);
  assert.throws(() => parseSalesCallMutation({ id: "call-1" }, "PATCH"), /At least one update/);
  assert.throws(() => parseSalesCallMutation({ id: "x".repeat(201), name: "Alex" }, "PATCH"), /Invalid id/);
  assert.doesNotThrow(() => parseSalesCallMutation({ id: "x".repeat(200), name: "x".repeat(500), call_notes: "x".repeat(10_000) }, "PATCH"));
  assert.throws(() => parseSalesCallMutation(validPost({ name: "x".repeat(501) }), "POST"), /Invalid name/);
  assert.throws(() => parseSalesCallMutation(validPost({ call_notes: "x".repeat(10_001) }), "POST"), /Invalid call_notes/);

  for (const [field, allowed, denied] of [
    ["result", "✅ Sale", "Sale"],
    ["call_type", "📞 Sales Call", "sales"],
    ["prospect_quality", "🔥 High", "high"],
    ["follow_up_status", "🚀 Rebook", "hidden"],
  ]) {
    assert.doesNotThrow(() => parseSalesCallMutation(validPost({ [field]: allowed }), "POST"));
    assert.throws(() => parseSalesCallMutation(validPost({ [field]: denied }), "POST"), new RegExp(`Invalid ${field}`));
  }

  assert.doesNotThrow(() => parseSalesCallMutation(validPost({ deal_amount: 1_000_000_000, recording_url: "https://example.com/recording", objections: Array(50).fill("x".repeat(500)) }), "POST"));
  assert.throws(() => parseSalesCallMutation(validPost({ deal_amount: 1_000_000_001 }), "POST"), /Invalid deal_amount/);
  assert.throws(() => parseSalesCallMutation(validPost({ recording_url: "javascript:alert(1)" }), "POST"), /Invalid recording_url/);
  assert.throws(() => parseSalesCallMutation(validPost({ objections: Array(51).fill("x") }), "POST"), /Invalid objections/);
  assert.throws(() => parseSalesCallMutation(validPost({ objections: ["x".repeat(501)] }), "POST"), /Invalid objections/);
});


test("GET isolates legacy marker-like rows and hides only a valid marker bound to moved-off status", async () => {
  const original = globalThis.fetch;
  const validMarker = "[[salesos-booked-view:v1:r:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA]]";
  const malformed = "Legacy note with [[salesos-booked-view:not-a-marker]] inline";
  const rows = [
    { id: "good", call_notes: "ordinary", follow_up_status: null },
    { id: "legacy-malformed", call_notes: malformed, follow_up_status: null },
    { id: "legacy-valid-looking", call_notes: `ordinary\n\n${validMarker}`, follow_up_status: "🚀 Rebook" },
    { id: "moved-valid", call_notes: `hidden note\n\n${validMarker}`, follow_up_status: "🗃️ Moved Off Booked View" },
    { id: "moved-malformed", call_notes: malformed, follow_up_status: "🗃️ Moved Off Booked View" },
  ];
  globalThis.fetch = async () => Response.json(rows);
  try {
    const response = await handlers.GET();
    assert.equal(response.status, 200);
    const calls = (await response.json()).calls;
    assert.equal(calls.length, rows.length);
    assert.deepEqual(calls.find((row) => row.id === "good"), { ...rows[0], booked_view_moved_off: false });
    assert.equal(calls.find((row) => row.id === "legacy-malformed").call_notes, malformed);
    assert.equal(calls.find((row) => row.id === "legacy-malformed").booked_view_moved_off, false);
    assert.equal(calls.find((row) => row.id === "legacy-valid-looking").call_notes, rows[2].call_notes);
    assert.equal(calls.find((row) => row.id === "legacy-valid-looking").booked_view_moved_off, false);
    const moved = calls.find((row) => row.id === "moved-valid");
    assert.equal(moved.call_notes, "hidden note");
    assert.equal(moved.follow_up_status, "🚀 Rebook");
    assert.equal(moved.booked_view_moved_off, true);
    assert.doesNotMatch(JSON.stringify(moved), /salesos-booked-view|Moved Off Booked View/);
    const broken = calls.find((row) => row.id === "moved-malformed");
    assert.equal(broken.call_notes, malformed);
    assert.equal(broken.follow_up_status, null);
    assert.equal(broken.booked_view_moved_off, false);
    assert.equal(broken.booked_view_error, "invalid_internal_marker");
  } finally { globalThis.fetch = original; }
});

test("move-off action rejects every server-ineligible call before writing", async () => {
  const original = globalThis.fetch;
  const base = {
    id: "call-ineligible", name: "Alex", email: null, phone: null, call_type: "📞 Sales Call",
    call_date: "2099-09-07T15:00:00.000Z", confirmed: "✅ Confirmed", result: "🔜 Upcoming",
    showed: null, success: null, offer: null, deal_amount: null, follow_up_status: null,
    follow_up_date: null, follow_up_notes: null, call_notes: null, updated_at: "2026-09-06T12:00:00.000Z",
  };
  const cases = [
    { call_date: "2000-01-01T00:00:00.000Z" },
    { result: "✅ Sale", showed: true, success: true },
    { confirmed: null },
    { call_type: "🧑‍💼 Client Call" },
  ];
  let stored = base;
  let writes = 0;
  globalThis.fetch = async (input, init = {}) => {
    const method = init.method ?? (typeof input === "string" ? "GET" : input.method);
    if (method === "GET") return Response.json(stored);
    writes += 1;
    return Response.json({ ...stored, ...JSON.parse(init.body) });
  };
  try {
    for (const overrides of cases) {
      stored = { ...base, ...overrides };
      const response = await handlers.PATCH(jsonRequest("PATCH", {
        id: stored.id, booked_view_action: "move_off", expected_updated_at: stored.updated_at,
      }));
      assert.equal(response.status, 409, JSON.stringify(overrides));
      assert.match((await response.json()).error, /not eligible|booked/i);
    }
    assert.equal(writes, 0);
  } finally { globalThis.fetch = original; }
});

test("booked-view route action durably preserves and restores Rebook while hiding its internal marker", async () => {
  const original = globalThis.fetch;
  let stored = {
    id: "call-rebook", name: "Alex", email: null, phone: null, call_type: "📞 Sales Call",
    call_date: "2099-09-07T15:00:00.000Z", confirmed: "✅ Confirmed", result: "🔜 Upcoming",
    showed: null, success: null, offer: null, deal_amount: null, follow_up_status: "🚀 Rebook",
    follow_up_date: null, follow_up_notes: null, call_notes: "User-visible note",
    updated_at: "2026-09-06T12:00:00.000Z",
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = init.method ?? (typeof input === "string" ? "GET" : input.method);
    if (!url.pathname.endsWith("/sales_calls")) return Response.json([]);
    if (method === "GET") return Response.json(stored);
    const patch = JSON.parse(init.body);
    if (url.searchParams.get("updated_at") !== `eq.${stored.updated_at}`) return Response.json([]);
    stored = { ...stored, ...patch, updated_at: stored.updated_at.endsWith("00.000Z") ? "2026-09-06T12:01:00.000Z" : "2026-09-06T12:02:00.000Z" };
    return Response.json(stored);
  };
  try {
    const movedResponse = await handlers.PATCH(jsonRequest("PATCH", {
      id: stored.id, booked_view_action: "move_off", expected_updated_at: stored.updated_at,
    }));
    assert.equal(movedResponse.status, 200);
    const moved = await movedResponse.json();
    assert.equal(moved.call.follow_up_status, "🚀 Rebook");
    assert.equal(moved.call.call_notes, "User-visible note");
    assert.equal(moved.call.booked_view_moved_off, true);
    assert.match(moved.call.booked_view_revision, /^v1:[A-Za-z0-9_-]{20,}$/);
    assert.match(stored.call_notes, /salesos-booked-view:v1/);
    assert.doesNotMatch(JSON.stringify(moved), /salesos-booked-view/);

    const restoredResponse = await handlers.PATCH(jsonRequest("PATCH", {
      id: stored.id, booked_view_action: "restore", expected_updated_at: stored.updated_at,
      booked_view_revision: moved.call.booked_view_revision,
    }));
    assert.equal(restoredResponse.status, 200);
    const restored = await restoredResponse.json();
    assert.equal(restored.call.follow_up_status, "🚀 Rebook");
    assert.equal(restored.call.call_notes, "User-visible note");
    assert.equal(restored.call.booked_view_moved_off, false);
    assert.equal(stored.call_notes, "User-visible note");
  } finally { globalThis.fetch = original; }
});


test("ordinary notes PATCH cannot erase a concurrent move-off marker", async () => {
  const original = globalThis.fetch;
  const marker = "[[salesos-booked-view:v1:r:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB]]";
  const before = {
    id: "call-race-move", name: "Alex", email: null, phone: null, call_type: "📞 Sales Call",
    call_date: "2099-09-07T15:00:00.000Z", confirmed: "✅ Confirmed", result: "🔜 Upcoming",
    showed: null, success: null, offer: null, deal_amount: null, follow_up_status: "🚀 Rebook",
    follow_up_date: null, follow_up_notes: null, call_notes: "before", updated_at: "2026-09-06T12:00:00.000Z",
  };
  let stored = { ...before };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = init.method ?? (typeof input === "string" ? "GET" : input.method);
    if (method === "GET") return Response.json({ ...before });
    stored = { ...before, call_notes: `before\n\n${marker}`, follow_up_status: "🗃️ Moved Off Booked View", updated_at: "2026-09-06T12:01:00.000Z" };
    const hasCas = url.searchParams.get("updated_at") === `eq.${before.updated_at}`
      && url.searchParams.get("call_notes") === `eq.${before.call_notes}`
      && url.searchParams.get("follow_up_status") === `eq.${before.follow_up_status}`;
    if (hasCas) return Response.json([]);
    stored = { ...stored, ...JSON.parse(init.body) };
    return Response.json(stored);
  };
  try {
    const response = await handlers.PATCH(jsonRequest("PATCH", { id: before.id, call_notes: "ordinary edit" }));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /changed/i);
    assert.match(stored.call_notes, /salesos-booked-view/);
    assert.equal(stored.follow_up_status, "🗃️ Moved Off Booked View");
  } finally { globalThis.fetch = original; }
});

test("ordinary notes PATCH cannot resurrect a marker after concurrent restore", async () => {
  const original = globalThis.fetch;
  const marker = "[[salesos-booked-view:v1:r:CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC]]";
  const before = {
    id: "call-race-restore", name: "Alex", email: null, phone: null, call_type: "📞 Sales Call",
    call_date: "2099-09-07T15:00:00.000Z", confirmed: "✅ Confirmed", result: "🔜 Upcoming",
    showed: null, success: null, offer: null, deal_amount: null, follow_up_status: "🗃️ Moved Off Booked View",
    follow_up_date: null, follow_up_notes: null, call_notes: `before\n\n${marker}`, updated_at: "2026-09-06T12:00:00.000Z",
  };
  let stored = { ...before };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = init.method ?? (typeof input === "string" ? "GET" : input.method);
    if (method === "GET") return Response.json({ ...before });
    stored = { ...before, call_notes: "before", follow_up_status: "🚀 Rebook", updated_at: "2026-09-06T12:01:00.000Z" };
    const hasCas = url.searchParams.get("updated_at") === `eq.${before.updated_at}`
      && url.searchParams.get("call_notes") === `eq.${before.call_notes}`
      && url.searchParams.get("follow_up_status") === `eq.${before.follow_up_status}`;
    if (hasCas) return Response.json([]);
    stored = { ...stored, ...JSON.parse(init.body) };
    return Response.json(stored);
  };
  try {
    const response = await handlers.PATCH(jsonRequest("PATCH", { id: before.id, call_notes: "ordinary edit" }));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /changed/i);
    assert.equal(stored.call_notes, "before");
    assert.equal(stored.follow_up_status, "🚀 Rebook");
  } finally { globalThis.fetch = original; }
});

test("retry after call commit and lead-sync failure completes one durable outcome marker and stage", async () => {
  const original = globalThis.fetch;
  let storedCall = {
    id: "call-retry", name: "Alex", email: "alex@example.com", phone: null, call_type: "📞 Sales Call",
    call_date: "2026-09-06T11:00:00.000Z", confirmed: "✅ Confirmed", result: "🔜 Upcoming",
    showed: null, success: null, offer: null, deal_amount: null, follow_up_status: null,
    follow_up_date: null, follow_up_notes: null, call_notes: null, updated_at: "2026-09-06T12:00:00.000Z",
  };
  let storedLead = { id: "lead-retry", full_name: "Alex", email: "alex@example.com", phone: null, prospect_stage: "📞 Call Booked", notes: "Existing" };
  let failLeadWrite = true;
  let leadWrites = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = init.method ?? (typeof input === "string" ? "GET" : input.method);
    if (url.pathname.endsWith("/sales_calls")) {
      if (method === "GET") return Response.json(storedCall);
      storedCall = { ...storedCall, ...JSON.parse(init.body), updated_at: new Date(Date.parse(storedCall.updated_at) + 60_000).toISOString() };
      return Response.json(storedCall);
    }
    if (url.pathname.endsWith("/leads") && method === "GET") {
      if (url.searchParams.has("email") || url.searchParams.has("id")) return Response.json(url.searchParams.has("id") ? storedLead : [storedLead]);
      return Response.json([]);
    }
    if (url.pathname.endsWith("/leads") && method === "PATCH") {
      leadWrites += 1;
      if (failLeadWrite) { failLeadWrite = false; return new Response(JSON.stringify({ message: "transient" }), { status: 500, headers: { "content-type": "application/json" } }); }
      storedLead = { ...storedLead, ...JSON.parse(init.body) };
      return Response.json(storedLead);
    }
    return Response.json([]);
  };
  try {
    const request = () => handlers.PATCH(jsonRequest("PATCH", { id: storedCall.id, result: "📣 Follow Up", showed: true, success: false }));
    const first = await request();
    assert.equal(first.status, 200);
    assert.equal((await first.json()).leadSync.status, "error");
    assert.equal(storedCall.result, "📣 Follow Up");
    assert.doesNotMatch(storedLead.notes, /sales-call:call-retry/);

    const second = await request();
    assert.equal(second.status, 200);
    const payload = await second.json();
    assert.equal(payload.leadSync.status, "updated");
    assert.equal(storedLead.prospect_stage, "🔥 Hot Prospect");
    assert.equal((storedLead.notes.match(/sales-call:call-retry/g) ?? []).length, 1);
    assert.equal(leadWrites, 2);
  } finally { globalThis.fetch = original; }
});


test("booked-view actions require an exact marker and moved-off status binding", async () => {
  const original = globalThis.fetch;
  const marker = "[[salesos-booked-view:v1:r:DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD]]";
  const existing = {
    id: "legacy-valid-looking", name: "Alex", email: null, phone: null, call_type: "📞 Sales Call",
    call_date: "2099-09-07T15:00:00.000Z", confirmed: "✅ Confirmed", result: "🔜 Upcoming",
    showed: null, success: null, offer: null, deal_amount: null, follow_up_status: "🚀 Rebook",
    follow_up_date: null, follow_up_notes: null, call_notes: `ordinary\n\n${marker}`,
    updated_at: "2026-09-06T12:00:00.000Z",
  };
  let writes = 0;
  globalThis.fetch = async (input, init = {}) => {
    const method = init.method ?? (typeof input === "string" ? "GET" : input.method);
    if (method === "GET") return Response.json(existing);
    writes += 1;
    return Response.json({ ...existing, ...JSON.parse(init.body) });
  };
  try {
    const response = await handlers.PATCH(jsonRequest("PATCH", {
      id: existing.id,
      booked_view_action: "restore",
      expected_updated_at: existing.updated_at,
      booked_view_revision: "v1:DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
    }));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /marker|revision|moved/i);
    assert.equal(writes, 0);
  } finally { globalThis.fetch = original; }
});

test("booked-view actions reject malformed markers, stale revisions, and lost compare-and-set races", async () => {
  const original = globalThis.fetch;
  const base = {
    id: "call-cas", name: "Alex", email: null, phone: null, call_type: "📞 Sales Call",
    call_date: "2099-09-07T15:00:00.000Z", confirmed: "✅ Confirmed", result: "🔜 Upcoming",
    showed: null, success: null, offer: null, deal_amount: null, follow_up_status: "🚀 Rebook",
    follow_up_date: null, follow_up_notes: null, updated_at: "2026-09-06T12:00:00.000Z",
  };
  let stored = { ...base, call_notes: "[[salesos-booked-view:v1:r:bad]]" };
  let writes = 0;
  globalThis.fetch = async (input, init = {}) => {
    const method = init.method ?? (typeof input === "string" ? "GET" : input.method);
    if (method === "GET") return Response.json(stored);
    writes += 1;
    return Response.json([]);
  };
  try {
    let response = await handlers.PATCH(jsonRequest("PATCH", { id: base.id, booked_view_action: "move_off", expected_updated_at: base.updated_at }));
    assert.equal(response.status, 409);
    assert.equal(writes, 0);

    stored = { ...base, call_notes: "Visible" };
    response = await handlers.PATCH(jsonRequest("PATCH", { id: base.id, booked_view_action: "move_off", expected_updated_at: "2026-09-06T11:59:00.000Z" }));
    assert.equal(response.status, 409);
    assert.equal(writes, 0);

    response = await handlers.PATCH(jsonRequest("PATCH", { id: base.id, booked_view_action: "move_off", expected_updated_at: base.updated_at }));
    assert.equal(response.status, 409);
    assert.equal(writes, 1);
    assert.match((await response.json()).error, /changed/i);
  } finally { globalThis.fetch = original; }
});
