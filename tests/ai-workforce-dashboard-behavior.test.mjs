import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/jarvis?tab=core" });
globalThis.window = dom.window;
globalThis.self = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.Event = dom.window.Event;
globalThis.Node = dom.window.Node;
globalThis.HTMLDialogElement = dom.window.HTMLDialogElement;
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
dom.window.requestAnimationFrame = globalThis.requestAnimationFrame;
dom.window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
if (!dom.window.HTMLDialogElement.prototype.showModal) {
  dom.window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function close() { this.open = false; };
}
if (!globalThis.crypto?.randomUUID) {
  globalThis.crypto = { ...globalThis.crypto, randomUUID: () => "11111111-2222-3333-4444-555555555555" };
}

const { act, cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const { AgentWorkforceDashboard } = await import("../components/agent-workforce-dashboard.tsx");
const { DEFAULT_AGENT_WORKFORCE } = await import("../lib/agent-workforce-default.ts");

let originalFetch;
let requests;
let currentDocument;

const clone = (value) => JSON.parse(JSON.stringify(value));

beforeEach(() => {
  originalFetch = globalThis.fetch;
  requests = [];
  currentDocument = clone(DEFAULT_AGENT_WORKFORCE);
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (options.method === "PUT") {
      const body = JSON.parse(options.body);
      // Mirror the server: reject anything carrying server-owned timestamps.
      for (const agent of body.agents) {
        if ("created_at" in agent || "updated_at" in agent) {
          return new Response(JSON.stringify({ error: "Unknown field: created_at" }), { status: 400 });
        }
      }
      if (body.expected_revision !== currentDocument.revision) {
        return new Response(JSON.stringify({ error: "Stale agent workforce revision" }), { status: 409 });
      }
      const revision = new Date(Date.parse(currentDocument.revision) + 1000).toISOString();
      const previous = new Map(currentDocument.agents.map((agent) => [agent.id, agent]));
      currentDocument = {
        version: 1,
        revision,
        updated_at: revision,
        agents: body.agents.map((agent) => ({
          ...agent,
          created_at: previous.get(agent.id)?.created_at ?? revision,
          updated_at: revision,
        })),
      };
      return new Response(JSON.stringify({ document: currentDocument }), { status: 200 });
    }
    return new Response(JSON.stringify({ document: currentDocument }), { status: 200 });
  };
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

async function mount(view) {
  const utils = render(React.createElement(AgentWorkforceDashboard, { view, ownerId: "owner-1" }));
  await waitFor(() => assert.ok(utils.container.querySelector("article")));
  return utils;
}

test("the Core Agents view lists the four department heads with their teams", async () => {
  const { container } = await mount("core");
  const names = Array.from(container.querySelectorAll("article h3")).map((node) => node.textContent);
  assert.deepEqual(names, ["Maya", "Cora", "Sterling", "Forge"]);
  assert.match(container.textContent, /6 sub-agents/);
  assert.match(container.textContent, /Content/);
});

test("the summary reports both counts, the stage spread, and approval gating", async () => {
  const { container } = await mount("core");
  const text = container.textContent;
  assert.match(text, /Core agents/);
  assert.match(text, /Sub-agents/);
  assert.match(text, /Approval gated/);
  assert.match(text, /Overall build/);
  assert.match(text, /Planned \d+/);
  assert.match(text, /Released \d+/);
});

test("runtime state is reported as unavailable rather than implied", async () => {
  const { container } = await mount("core");
  assert.match(container.textContent, /not connected/i);
  assert.doesNotMatch(container.textContent, /Running now|Online|Healthy/i);
});

test("searching matches a capability, not just a name", async () => {
  const { container, getByPlaceholderText } = await mount("subagent");
  const search = getByPlaceholderText(/Search name, role, capability/i);
  await act(async () => { fireEvent.change(search, { target: { value: "voice-of-customer" } }); });
  const names = Array.from(container.querySelectorAll("article h3")).map((node) => node.textContent);
  assert.deepEqual(names, ["Scout"]);
});

test("sub-agents filter down to one core agent's team", async () => {
  const { container, getByLabelText } = await mount("subagent");
  await act(async () => { fireEvent.change(getByLabelText(/Filter by core agent/i), { target: { value: "forge-systems-director" } }); });
  const names = Array.from(container.querySelectorAll("article h3")).map((node) => node.textContent);
  assert.deepEqual(names, ["Builder", "Sentinel", "Lens"]);
  assert.match(container.textContent, /Showing 3 of 19 sub-agents/);
});

test("the autonomy filter isolates the approval-gated workers", async () => {
  const { container, getByLabelText } = await mount("subagent");
  await act(async () => { fireEvent.change(getByLabelText(/Filter by autonomy/i), { target: { value: "approval_gated" } }); });
  const names = Array.from(container.querySelectorAll("article h3")).map((node) => node.textContent);
  assert.deepEqual(names, ["Launch", "Relay", "Circle", "Care", "Nudge"]);
});

test("filters combine and an empty result is stated plainly", async () => {
  const { container, getByLabelText } = await mount("subagent");
  await act(async () => { fireEvent.change(getByLabelText(/Filter by core agent/i), { target: { value: "forge-systems-director" } }); });
  await act(async () => { fireEvent.change(getByLabelText(/Filter by autonomy/i), { target: { value: "approval_gated" } }); });
  assert.equal(container.querySelectorAll("article").length, 0);
  assert.match(container.textContent, /No agents match this view/);
});

test("opening an agent shows mission, responsibilities, triggers, notes, and definition history", async () => {
  const { container, getByLabelText } = await mount("core");
  await act(async () => { fireEvent.click(getByLabelText("Open Sterling")); });
  const drawer = container.querySelector("dialog");
  assert.ok(drawer, "the detail drawer opens");
  const text = drawer.textContent;
  assert.match(text, /Sales Director/);
  assert.match(text, /Responsibilities/);
  assert.match(text, /Keep one truthful record per human in the pipeline/);
  assert.match(text, /Triggers/);
  assert.match(text, /A new lead arrives/);
  assert.match(text, /Notes/);
  assert.match(text, /Definition history/);
  assert.match(text, /not run history/i);
});

test("editing an agent saves only editable fields and shows the new value", async () => {
  const { container, getByLabelText } = await mount("core");
  await act(async () => { fireEvent.click(getByLabelText("Edit agent Maya")); });
  const editor = container.querySelector("dialog");
  const milestone = within(editor).getByPlaceholderText(/What must be built next\?/i);
  await act(async () => { fireEvent.change(milestone, { target: { value: "Ship the approval queue" } }); });
  const notes = within(editor).getByPlaceholderText(/Anything worth remembering/i);
  await act(async () => { fireEvent.change(notes, { target: { value: "Checked with Andrew." } }); });
  await act(async () => { fireEvent.submit(editor.querySelector("form")); });

  await waitFor(() => assert.match(container.textContent, /Ship the approval queue/));
  const put = requests.find((request) => request.options.method === "PUT");
  assert.ok(put, "a save request was sent");
  const body = JSON.parse(put.options.body);
  assert.equal(body.expected_revision, DEFAULT_AGENT_WORKFORCE.revision);
  for (const agent of body.agents) {
    assert.equal("created_at" in agent, false, "the client never sends server timestamps");
    assert.equal("updated_at" in agent, false);
  }
  const maya = body.agents.find((agent) => agent.id === "maya-content-director");
  assert.equal(maya.next_milestone, "Ship the approval queue");
  assert.equal(maya.notes, "Checked with Andrew.");
  assert.equal(body.agents.length, 23, "no agent is dropped by an edit");
});

test("a stale revision surfaces a conflict instead of overwriting", async () => {
  const { container, getByLabelText } = await mount("core");
  // Another writer saves first, so the revision the editor holds is now stale.
  currentDocument = { ...clone(currentDocument), revision: "2030-01-01T00:00:00.000Z" };
  await act(async () => { fireEvent.click(getByLabelText("Edit agent Cora")); });
  const editor = container.querySelector("dialog");
  const milestone = within(editor).getByPlaceholderText(/What must be built next\?/i);
  await act(async () => { fireEvent.change(milestone, { target: { value: "Conflicting edit" } }); });
  await act(async () => { fireEvent.submit(editor.querySelector("form")); });
  await waitFor(() => {
    const conflicted = requests.some((request) => request.options.method === "PUT");
    assert.ok(conflicted);
  });
  // The draft survives the conflict rather than being discarded.
  const stillOpen = container.querySelector("dialog");
  assert.ok(stillOpen, "the editor stays open on a conflict");
  const preserved = within(stillOpen).getByPlaceholderText(/What must be built next\?/i);
  assert.equal(preserved.value, "Conflicting edit", "the local draft is preserved");
  assert.match(stillOpen.textContent, /reload|changed|latest|conflict/i);
});

test("creating a sub-agent requires a parent and records the hierarchy", async () => {
  const { container, getByText } = await mount("subagent");
  await act(async () => { fireEvent.click(getByText(/Create agent/i)); });
  const editor = container.querySelector("dialog");
  const form = editor.querySelector("form");
  const set = (placeholder, value) => {
    const field = within(editor).getByPlaceholderText(placeholder);
    fireEvent.change(field, { target: { value } });
  };
  await act(async () => {
    set("Maya", "Beacon");
    set("Content Director", "Signal Router");
    set(/What outcome is this agent responsible for\?/i, "Route signals to the right owner.");
    set(/How should this agent think/i, "Direct and precise.");
  });
  const parentSelect = within(editor).getByLabelText(/Reports to/i);
  await act(async () => { fireEvent.change(parentSelect, { target: { value: "cora-client-success" } }); });
  await act(async () => { fireEvent.submit(form); });

  await waitFor(() => {
    const put = requests.find((request) => request.options.method === "PUT");
    assert.ok(put, "the create was sent");
  });
  const body = JSON.parse(requests.find((request) => request.options.method === "PUT").options.body);
  assert.equal(body.agents.length, 24);
  const created = body.agents.at(-1);
  assert.equal(created.name, "Beacon");
  assert.equal(created.type, "subagent");
  assert.equal(created.parent_id, "cora-client-success");
  assert.equal("created_at" in created, false);
});
