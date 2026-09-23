import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/clients/new" });
globalThis.window = dom.window;
globalThis.self = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render } = await import("@testing-library/react");
const { default: ClientOnboarding } = await import("../components/client-onboarding.tsx");
const { default: ClientsWorkspace } = await import("../app/clients/clients-workspace.tsx");

afterEach(cleanup);

const client = {
  key: "client-1",
  accountId: "client-1",
  helmId: "client-1",
  name: "Jane Client",
  email: "jane@example.com",
  phone: null,
  program: "Mastermind",
  status: "🆕 Not Started",
  owner: "Andrew",
  dealValue: 12000,
  mrr: 1000,
  startDate: "2026-09-20",
  addedAt: "2026-09-20T12:00:00.000Z",
  notes: null,
  whatsapp: null,
  onboarding: {},
  helm: {
    membership: "Mastermind",
    isActive: true,
    lastContactAt: null,
    portalStatus: null,
    callsAttended: null,
    headshotUrl: null,
  },
  editable: true,
};

test("each New Clients row has an explicit removal control", () => {
  const view = render(React.createElement(ClientOnboarding, {
    clients: [client],
    busyKey: null,
    onPatch() {},
    onCreate() {},
    onStep() {},
    onRemove() {},
  }));

  assert.ok(view.getByRole("button", { name: "Remove Jane Client from New Clients" }));
});

test("removal requires confirmation and explains that the client record is kept", () => {
  let removals = 0;
  let prompt = "";
  window.confirm = (message) => {
    prompt = String(message);
    return false;
  };
  const view = render(React.createElement(ClientOnboarding, {
    clients: [client],
    busyKey: null,
    onPatch() {},
    onCreate() {},
    onStep() {},
    onRemove() { removals += 1; },
  }));
  const button = view.getByRole("button", { name: "Remove Jane Client from New Clients" });

  fireEvent.click(button);
  assert.equal(removals, 0, "cancelling must keep the client on the list");
  assert.match(prompt, /keeps their client record, history, and access/i);

  window.confirm = () => true;
  fireEvent.click(button);
  assert.equal(removals, 1);
});

function workspaceFetch(patchResponse) {
  return async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith("/api/clients?")) {
      return Response.json({ generatedAt: "2026-09-23T12:00:00.000Z", activity: [] });
    }
    if (url === "/api/clients/accounts" && (init.method ?? "GET") === "GET") {
      return Response.json({ clients: [client] });
    }
    if (url === "/api/clients/accounts" && init.method === "PATCH") return patchResponse();
    throw new Error(`Unexpected request: ${init.method ?? "GET"} ${url}`);
  };
}

test("ClientsWorkspace removes a New row immediately after a successful PATCH and announces success", async () => {
  const originalFetch = globalThis.fetch;
  window.confirm = () => true;
  globalThis.fetch = workspaceFetch(() => Response.json({
    client: {
      ...client,
      onboarding: { _newClients: { visible: false, changedAt: "2026-09-23T12:01:00.000Z" } },
    },
  }));

  try {
    const view = render(React.createElement(ClientsWorkspace, { view: "New" }));
    const remove = await view.findByRole("button", { name: "Remove Jane Client from New Clients" });
    await act(async () => {
      fireEvent.click(remove);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.equal(view.queryByRole("button", { name: "Remove Jane Client from New Clients" }), null);
    assert.match(view.getByRole("status").textContent, /removed from New Clients/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ClientsWorkspace keeps the requested row when a successful PATCH returns a different client", async () => {
  const originalFetch = globalThis.fetch;
  window.confirm = () => true;
  globalThis.fetch = workspaceFetch(() => Response.json({
    client: {
      ...client,
      key: "client-2",
      accountId: "client-2",
      helmId: "client-2",
      onboarding: { _newClients: { visible: false, changedAt: "2026-09-23T12:01:00.000Z" } },
    },
  }));

  try {
    const view = render(React.createElement(ClientsWorkspace, { view: "New" }));
    const remove = await view.findByRole("button", { name: "Remove Jane Client from New Clients" });
    await act(async () => {
      fireEvent.click(remove);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.ok(view.getByRole("button", { name: "Remove Jane Client from New Clients" }));
    assert.equal(view.getByRole("status").textContent, "Could not remove the client from New Clients");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ClientsWorkspace keeps the requested row when a successful PATCH omits the persisted removal marker", async () => {
  const originalFetch = globalThis.fetch;
  window.confirm = () => true;
  globalThis.fetch = workspaceFetch(() => Response.json({ client: { ...client, onboarding: {} } }));

  try {
    const view = render(React.createElement(ClientsWorkspace, { view: "New" }));
    const remove = await view.findByRole("button", { name: "Remove Jane Client from New Clients" });
    await act(async () => {
      fireEvent.click(remove);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.ok(view.getByRole("button", { name: "Remove Jane Client from New Clients" }));
    assert.equal(view.getByRole("status").textContent, "Could not remove the client from New Clients");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ClientsWorkspace keeps a New row and shows bounded friendly feedback for non-JSON PATCH failure", async () => {
  const originalFetch = globalThis.fetch;
  window.confirm = () => true;
  globalThis.fetch = workspaceFetch(() => new Response("<html>upstream exploded</html>", {
    status: 502,
    headers: { "content-type": "text/html" },
  }));

  try {
    const view = render(React.createElement(ClientsWorkspace, { view: "New" }));
    const remove = await view.findByRole("button", { name: "Remove Jane Client from New Clients" });
    await act(async () => {
      fireEvent.click(remove);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.ok(view.getByRole("button", { name: "Remove Jane Client from New Clients" }));
    const feedback = view.getByRole("status").textContent ?? "";
    assert.equal(feedback, "Could not remove the client from New Clients");
    assert.ok(feedback.length <= 80);
    assert.doesNotMatch(feedback, /unexpected token|json|syntax/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
