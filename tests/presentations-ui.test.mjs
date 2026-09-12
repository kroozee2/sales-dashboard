import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/jarvis?tab=presentations" });
globalThis.window = dom.window;
globalThis.self = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.Event = dom.window.Event;
globalThis.HTMLDialogElement = dom.window.HTMLDialogElement;
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
if (!dom.window.HTMLDialogElement.prototype.showModal) dom.window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
if (!dom.window.HTMLDialogElement.prototype.close) dom.window.HTMLDialogElement.prototype.close = function close() { this.open = false; };
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};

const { act, cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const { PresentationsWorkspace } = await import("../components/presentations-workspace.tsx");
const { createSeedPresentationsDocument, updatePresentationsDocument } = await import("../lib/presentations.ts");

let originalFetch;
let requests;
let current;
let rowToken;
const clone = (value) => JSON.parse(JSON.stringify(value));

beforeEach(() => {
  originalFetch = globalThis.fetch;
  requests = [];
  current = createSeedPresentationsDocument();
  rowToken = null;
  window.sessionStorage.clear();
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (options.method === "PUT") {
      const input = JSON.parse(options.body);
      current = updatePresentationsDocument(current, input, "2026-09-12T10:00:00.000Z", rowToken);
      rowToken = current.updated_at;
      return new Response(JSON.stringify({ document: current, row_updated_at: rowToken }), { status: 200 });
    }
    return new Response(JSON.stringify({ document: current, row_updated_at: rowToken }), { status: 200 });
  };
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

async function mount() {
  const utils = render(React.createElement(PresentationsWorkspace, { ownerId: "owner-1" }));
  await waitFor(() => assert.match(utils.container.textContent, /The 5C AI Employee System/));
  return utils;
}

test("library preview and presenter expose audience copy without private notes", async () => {
  const { container, getByRole } = await mount();
  assert.match(container.textContent, /22 slides/);
  assert.match(container.textContent, /Draft/);
  fireEvent.click(getByRole("button", { name: /Preview The 5C AI Employee System/ }));
  const preview = getByRole("dialog", { name: /Preview: The 5C AI Employee System/ });
  assert.match(preview.textContent, /Turn your expertise into an AI employee/);
  assert.doesNotMatch(preview.textContent, /Today is not about collecting more AI tools/);
  fireEvent.click(within(preview).getByRole("button", { name: "Present" }));
  const presenter = getByRole("dialog", { name: /Presenting: The 5C AI Employee System/ });
  assert.match(presenter.textContent, /1 \/ 22/);
  fireEvent.keyDown(presenter, { key: "ArrowRight" });
  assert.match(presenter.textContent, /2 \/ 22/);
  fireEvent.keyDown(presenter, { key: "Escape" });
  assert.equal(document.querySelector('[aria-label^="Presenting:"]'), null);
});

test("editor saves once, keeps stable identity, and clears the acknowledged recovery draft", async () => {
  const { getByRole } = await mount();
  fireEvent.click(getByRole("button", { name: /Edit The 5C AI Employee System/ }));
  const editor = getByRole("dialog", { name: /Edit presentation/ });
  const title = within(editor).getByLabelText("Presentation title");
  fireEvent.change(title, { target: { value: "The 5C AI Employee System — Live" } });
  assert.ok(Array.from({ length: window.sessionStorage.length }, (_, index) => window.sessionStorage.key(index)).some((key) => key?.includes("owner-1")));
  const form = editor.querySelector("form");
  await act(async () => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  await waitFor(() => assert.equal(requests.filter((request) => request.options.method === "PUT").length, 1));
  assert.equal(JSON.parse(requests.find((request) => request.options.method === "PUT").options.body).presentation.id, "the-5c-ai-employee-system");
  await waitFor(() => assert.equal(document.querySelector('[aria-label="Edit presentation"]'), null));
  assert.equal(window.sessionStorage.length, 0);
});

test("deploy creates a share destination and later draft edits leave its audience snapshot unchanged", async () => {
  const { getByRole } = await mount();
  await act(async () => { fireEvent.click(getByRole("button", { name: /Deploy The 5C AI Employee System/ })); });
  await waitFor(() => assert.equal(current.presentations[0].status, "deployed"));
  const snapshot = clone(current.presentations[0].deployed_snapshot);
  assert.equal("speaker_notes" in snapshot.slides[0], false);
  assert.match(document.body.textContent, /Deployed/);
  const share = getByRole("link", { name: /Open shared presentation/ });
  assert.equal(share.getAttribute("href"), "/present/the-5c-ai-employee-system");

  fireEvent.click(getByRole("button", { name: /Edit The 5C AI Employee System/ }));
  const editor = getByRole("dialog", { name: /Edit presentation/ });
  fireEvent.change(within(editor).getByLabelText("Presentation title"), { target: { value: "Changed draft" } });
  await act(async () => { fireEvent.submit(editor.querySelector("form")); });
  await waitFor(() => assert.equal(current.presentations[0].title, "Changed draft"));
  assert.deepEqual(current.presentations[0].deployed_snapshot, snapshot);
});

test("a restored session draft remains dirty and Escape keeps it when discard is declined", async () => {
  const first = await mount();
  fireEvent.click(first.getByRole("button", { name: /Edit The 5C AI Employee System/ }));
  fireEvent.change(within(first.getByRole("dialog", { name: /Edit presentation/ })).getByLabelText("Presentation title"), { target: { value: "Recovered title" } });
  cleanup();
  const confirm = window.confirm;
  window.confirm = () => false;
  const second = await mount();
  await waitFor(() => assert.equal(within(second.getByRole("dialog", { name: /Edit presentation/ })).getByLabelText("Presentation title").value, "Recovered title"));
  fireEvent.keyDown(second.getByRole("dialog", { name: /Edit presentation/ }), { key: "Escape" });
  assert.ok(second.getByRole("dialog", { name: /Edit presentation/ }));
  assert.equal(window.sessionStorage.length, 1);
  window.confirm = confirm;
});


test("malformed recovery data is rejected instead of opening an unsafe editor", async () => {
  const malformed = {
    version: 1, owner_id: "owner-1", surface: "presentations",
    presentation_id: current.presentations[0].id, server_revision: current.revision,
    form: { ...clone(current.presentations[0]), title: 42 },
  };
  window.sessionStorage.setItem(`salesos:presentations:draft:owner-1:${current.presentations[0].id}:${current.revision}`, JSON.stringify(malformed));
  await mount();
  assert.equal(document.querySelector('[aria-label="Edit presentation"]'), null);
});

test("dirty editors block same-origin link navigation so the recovery draft is retained", async () => {
  const { getByRole } = await mount();
  fireEvent.click(getByRole("button", { name: /Edit The 5C AI Employee System/ }));
  const editor = getByRole("dialog", { name: /Edit presentation/ });
  fireEvent.change(within(editor).getByLabelText("Presentation title"), { target: { value: "Navigation-safe draft" } });
  const link = document.createElement("a");
  link.href = "/home";
  document.body.append(link);
  assert.equal(fireEvent.click(link), false);
  assert.equal(window.sessionStorage.length, 1);
  link.remove();
});

test("save acknowledgement survives recovery cleanup failure and cleanup retry publishes the saved record without another write", async () => {
  const { getByRole } = await mount();
  fireEvent.click(getByRole("button", { name: /Edit The 5C AI Employee System/ }));
  const editor = getByRole("dialog", { name: /Edit presentation/ });
  fireEvent.change(within(editor).getByLabelText("Presentation title"), { target: { value: "Cleanup-safe title" } });

  const storagePrototype = Object.getPrototypeOf(window.sessionStorage);
  const originalRemoveItem = storagePrototype.removeItem;
  storagePrototype.removeItem = () => { throw new Error("storage blocked"); };
  try {
    await act(async () => { fireEvent.submit(editor.querySelector("form")); });
    await waitFor(() => assert.ok(getByRole("button", { name: "Retry draft cleanup" })));
    assert.equal(requests.filter((request) => request.options.method === "PUT").length, 1);
    assert.equal(within(editor).getByLabelText("Presentation title").disabled, true);
  } finally {
    storagePrototype.removeItem = originalRemoveItem;
  }

  fireEvent.click(getByRole("button", { name: "Retry draft cleanup" }));
  await waitFor(() => assert.equal(document.querySelector('[aria-label="Edit presentation"]'), null));
  assert.match(document.body.textContent, /Cleanup-safe title/);
  assert.equal(requests.filter((request) => request.options.method === "PUT").length, 1);
});
