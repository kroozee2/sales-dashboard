import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/offers" });
globalThis.window = dom.window;
globalThis.self = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { default: InfluenceWorkspace } = await import("../components/InfluenceWorkspace.tsx");

afterEach(() => cleanup());

test("Influence workspace searches and filters the complete strategy library", () => {
  const view = render(React.createElement(InfluenceWorkspace));

  assert.ok(view.getByRole("heading", { name: "Influence playbook" }));
  assert.ok(view.getByText("80 tactics"));
  assert.equal(view.getAllByRole("button", { name: /Copy example:/ }).length, 80);

  const search = view.getByRole("searchbox", { name: "Search influence tactics" });
  fireEvent.change(search, { target: { value: "weekly conversion" } });
  assert.match(view.getByRole("status").textContent ?? "", /\d+ tactics? shown/);
  assert.ok(view.getAllByRole("button", { name: /Copy example:/ }).length > 0);
  assert.ok(view.getAllByRole("button", { name: /Copy example:/ }).length < 80);

  fireEvent.change(search, { target: { value: "" } });
  fireEvent.click(view.getByRole("button", { name: /Open Loops, 10 tactics/ }));
  assert.match(view.getByRole("status").textContent ?? "", /10 tactics shown/);
  assert.equal(view.getAllByRole("button", { name: /Copy example:/ }).length, 10);

  fireEvent.change(search, { target: { value: "no-such-tactic" } });
  assert.ok(view.getByText("No tactics match that search."));
});

test("Quick Builder assembles only entered values and reports clipboard failures", async () => {
  const view = render(React.createElement(InfluenceWorkspace));
  fireEvent.click(view.getByRole("button", { name: "Open Quick Builder" }));

  fireEvent.change(view.getByLabelText("Audience / situation"), { target: { value: "Heart-centered consultants" } });
  fireEvent.change(view.getByLabelText("One next action"), { target: { value: "Map the weekly conversion event" } });

  const preview = view.getByLabelText("Influence brief preview");
  assert.match(preview.textContent ?? "", /Audience: Heart-centered consultants/);
  assert.match(preview.textContent ?? "", /Next action: Map the weekly conversion event/);
  assert.doesNotMatch(preview.textContent ?? "", /Current state:/);

  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => { throw new Error("denied"); } },
  });
  fireEvent.click(view.getByRole("button", { name: "Copy influence brief" }));
  await waitFor(() => assert.equal(view.getByRole("status").textContent, "Copy failed. Select the brief and copy it manually."));
  assert.ok(view.getByRole("button", { name: "Copy failed, retry influence brief" }));
});

test("a failed tactic copy stays visible on the affected card", async () => {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => { throw new Error("denied"); } },
  });

  const view = render(React.createElement(InfluenceWorkspace));
  const copyButton = view.getAllByRole("button", { name: /Copy example:/ })[0];
  fireEvent.click(copyButton);

  await waitFor(() => assert.match(view.getByRole("status").textContent ?? "", /Copy failed/));
  assert.ok(view.getByRole("button", { name: /Copy failed for .* Retry/ }));
});
