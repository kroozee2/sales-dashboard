import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

process.env.NEXT_PUBLIC_SUPABASE_HELM_URL = "https://helm-test.supabase.co";
process.env.SUPABASE_HELM_ANON_KEY = "test-anon-key";
process.env.HELM_OWNER_EMAIL = "owner@example.com";
process.env.HELM_OWNER_PASSWORD = "test-password";

const root = new URL("../", import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/client-accounts") return { url: new URL("lib/client-accounts.ts", root).href, shortCircuit: true };
    if (specifier === "@/lib/helm-clients") return { url: new URL("lib/helm-clients.ts", root).href, shortCircuit: true };
    if (specifier === "@/lib/client-media") return { url: new URL("lib/client-media.ts", root).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
let handlers;
let helm;
try {
  handlers = await import("../app/api/clients/accounts/route.ts");
  helm = await import("../lib/helm-clients.ts");
} finally {
  hooks.deregister();
}

const authResponse = () => Response.json({
  access_token: "test-access-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "test-refresh-token",
  user: { id: "owner-1", email: "owner@example.com", aud: "authenticated", role: "authenticated" },
});

function request(body) {
  return new Request("http://localhost/api/clients/accounts", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("PATCH rejects malformed New Clients commands before reading or writing a client", async () => {
  helm.resetHelmSession();
  const originalFetch = globalThis.fetch;
  let restCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/token")) return authResponse();
    if (url.includes("/rest/v1/")) restCalls += 1;
    return Response.json({ onboarding: {} });
  };

  try {
    for (const command of [null, {}, { visible: "false" }, { visible: false, extra: true }]) {
      const response = await handlers.PATCH(request({ id: "client-1", onboarding_list: command }));
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /visible must be true or false/i);
    }
    assert.equal(restCalls, 0, "invalid commands must not touch a client row");
  } finally {
    globalThis.fetch = originalFetch;
    helm.resetHelmSession();
  }
});

test("PATCH rejects non-object JSON roots with a controlled 400 before client row access", async () => {
  helm.resetHelmSession();
  const originalFetch = globalThis.fetch;
  let restCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/token")) return authResponse();
    if (url.includes("/rest/v1/")) restCalls += 1;
    return Response.json({ onboarding: {} });
  };

  try {
    for (const body of [null, [], "client-1", 42, true]) {
      const response = await handlers.PATCH(request(body));
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /json object/i);
    }
    assert.equal(restCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    helm.resetHelmSession();
  }
});

test("PATCH allows only id and onboarding_list for New Clients visibility commands", async () => {
  helm.resetHelmSession();
  const originalFetch = globalThis.fetch;
  let restCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/token")) return authResponse();
    if (url.includes("/rest/v1/")) restCalls += 1;
    return Response.json({ onboarding: {}, updated_at: "2026-09-20T12:00:00.000Z" });
  };

  try {
    for (const extra of [
      { archived: true }, { is_active: false }, { status: "👋 Off-Boarded" },
      { name: "Changed" }, { access: false }, { step: { key: "payment", done: true } },
    ]) {
      const response = await handlers.PATCH(request({
        id: "client-1", onboarding_list: { visible: false }, ...extra,
      }));
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /only id and onboarding_list/i);
    }
    assert.equal(restCalls, 0, "mixed visibility commands must fail before client row access");
  } finally {
    globalThis.fetch = originalFetch;
    helm.resetHelmSession();
  }
});

test("PATCH removal returns 409 instead of overwriting a concurrent checklist update", async () => {
  helm.resetHelmSession();
  const originalFetch = globalThis.fetch;
  const revision = "2026-09-20T12:00:00.000Z";
  let stored = { onboarding: {}, updated_at: revision };
  let guarded = false;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/auth/v1/token")) return authResponse();
    if ((init.method ?? "GET") === "GET") return Response.json({ ...stored });
    stored = {
      onboarding: { payment: { done: true, at: "2026-09-20T12:01:00.000Z" } },
      updated_at: "2026-09-20T12:01:00.000Z",
    };
    guarded = url.searchParams.get("updated_at") === `eq.${revision}`;
    return Response.json([]);
  };

  try {
    const response = await handlers.PATCH(request({
      id: "client-1", onboarding_list: { visible: false },
    }));
    assert.equal(response.status, 409);
    assert.equal(guarded, true, "the write must compare the exact row revision read");
    assert.equal(stored.onboarding.payment.done, true);
    assert.equal(stored.onboarding._newClients, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    helm.resetHelmSession();
  }
});

test("PATCH checklist update returns 409 instead of overwriting concurrent New Clients removal", async () => {
  helm.resetHelmSession();
  const originalFetch = globalThis.fetch;
  const revision = "2026-09-20T12:00:00.000Z";
  let stored = { onboarding: {}, updated_at: revision };
  let guarded = false;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/auth/v1/token")) return authResponse();
    if ((init.method ?? "GET") === "GET") return Response.json({ ...stored });
    stored = {
      onboarding: {
        _newClients: { visible: false, changedAt: "2026-09-20T12:01:00.000Z" },
      },
      updated_at: "2026-09-20T12:01:00.000Z",
    };
    guarded = url.searchParams.get("updated_at") === `eq.${revision}`;
    return Response.json([]);
  };

  try {
    const response = await handlers.PATCH(request({
      id: "client-1", step: { key: "payment", done: true },
    }));
    assert.equal(response.status, 409);
    assert.equal(guarded, true, "the write must compare the exact row revision read");
    assert.equal(stored.onboarding._newClients.visible, false);
    assert.equal(stored.onboarding.payment, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    helm.resetHelmSession();
  }
});

test("PATCH advances the persisted revision when the clock equals the revision read", async () => {
  helm.resetHelmSession();
  const originalFetch = globalThis.fetch;
  const originalDate = globalThis.Date;
  const revision = "2026-09-20T12:00:00.000Z";
  let written = null;
  globalThis.Date = class extends originalDate {
    constructor(value) { super(value === undefined ? revision : value); }
    static now() { return originalDate.parse(revision); }
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("/auth/v1/token")) return authResponse();
    if ((init.method ?? "GET") === "GET") {
      return Response.json({ onboarding: {}, updated_at: revision });
    }
    written = JSON.parse(String(init.body));
    return Response.json({
      id: "client-1", name: "Jane Client", email: "jane@example.com", phone: null,
      status: "🆕 Not Started", membership: "Mastermind", is_active: true, phase: null,
      start_date: "2026-09-20", last_contact_at: null, headshot_url: null, notes: null,
      ai_next_action: null, deal_value: 12000, mrr: 1000, owner: "Andrew", source: "Stripe",
      whatsapp: null, onboarding: written.onboarding, created_at: revision, updated_at: written.updated_at,
    });
  };

  try {
    const response = await handlers.PATCH(request({ id: "client-1", onboarding_list: { visible: false } }));
    assert.equal(response.status, 200);
    assert.notEqual(written.updated_at, revision);
    assert.ok(originalDate.parse(written.updated_at) > originalDate.parse(revision));
  } finally {
    globalThis.Date = originalDate;
    globalThis.fetch = originalFetch;
    helm.resetHelmSession();
  }
});

test("PATCH rejects an invalid persisted revision without writing", async () => {
  helm.resetHelmSession();
  const originalFetch = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("/auth/v1/token")) return authResponse();
    if ((init.method ?? "GET") === "GET") {
      return Response.json({ onboarding: {}, updated_at: "not-a-revision" });
    }
    writes += 1;
    return Response.json([]);
  };

  try {
    const response = await handlers.PATCH(request({ id: "client-1", onboarding_list: { visible: false } }));
    assert.equal(response.status, 409);
    assert.equal(writes, 0);
  } finally {
    globalThis.fetch = originalFetch;
    helm.resetHelmSession();
  }
});

test("PATCH removes only the New Clients view entry and returns the persisted client", async () => {
  helm.resetHelmSession();
  const originalFetch = globalThis.fetch;
  const existingOnboarding = { payment: { done: true, at: "2026-09-20T12:00:00.000Z" } };
  let written = null;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("/auth/v1/token")) return authResponse();
    if (url.includes("/rest/v1/clients") && (init.method ?? "GET") === "GET") {
      return Response.json({ onboarding: existingOnboarding, updated_at: "2026-09-20T12:00:00.000Z" });
    }
    if (url.includes("/rest/v1/clients") && init.method === "PATCH") {
      written = JSON.parse(String(init.body));
      return Response.json({
        id: "client-1", name: "Jane Client", email: "jane@example.com", phone: null,
        status: "🆕 Not Started", membership: "Mastermind", is_active: true, phase: null,
        start_date: "2026-09-20", last_contact_at: null, headshot_url: null, notes: null,
        ai_next_action: null, deal_value: 12000, mrr: 1000, owner: "Andrew", source: "Stripe",
        whatsapp: null, onboarding: written.onboarding, created_at: "2026-09-20T12:00:00.000Z",
        updated_at: written.updated_at,
      });
    }
    throw new Error(`Unexpected request: ${init.method ?? "GET"} ${url}`);
  };

  try {
    const response = await handlers.PATCH(request({ id: "client-1", onboarding_list: { visible: false } }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(written.onboarding._newClients.visible, false);
    assert.match(written.onboarding._newClients.changedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(written.onboarding.payment, existingOnboarding.payment);
    assert.equal(Object.hasOwn(written, "is_active"), false, "the client must remain active");
    assert.equal(Object.hasOwn(written, "status"), false, "the client lifecycle must not change");
    assert.equal(payload.client.onboarding._newClients.visible, false);
    assert.equal(payload.client.helm.isActive, true);
  } finally {
    globalThis.fetch = originalFetch;
    helm.resetHelmSession();
  }
});
