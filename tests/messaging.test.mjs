import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  createMessagingDocument,
  parseMessagingDocument,
  readBoundedRequestBody,
  updateMessagingDocument,
} from "../lib/messaging.ts";

const sampleSections = [
  { id: "strategic-direction", title: "Strategic Direction", content: "Lead with the business they want." },
  { id: "core-domino", title: "Core Domino Belief", content: "One clear offer and four engines." },
];

test("messaging documents are versioned, bounded, and preserve ordered editable sections", () => {
  const document = createMessagingDocument(
    { title: "7-Figure CEO Messaging Bible", subtitle: "Coaching Business With AI", sections: sampleSections },
    "2026-08-27T15:00:00.000Z",
  );

  assert.equal(document.version, 1);
  assert.equal(document.revision, "2026-08-27T15:00:00.000Z");
  assert.deepEqual(document.sections.map((section) => section.id), ["strategic-direction", "core-domino"]);
  assert.deepEqual(parseMessagingDocument(JSON.stringify(document)), document);

  assert.throws(
    () => createMessagingDocument({ title: "Messaging", subtitle: "", sections: [{ ...sampleSections[0], extra: true }] }),
    /unknown field/i,
  );
  assert.throws(
    () => createMessagingDocument({ title: "Messaging", subtitle: "", sections: [sampleSections[0], sampleSections[0]] }),
    /duplicate/i,
  );
  assert.throws(
    () => createMessagingDocument({ title: "Messaging", subtitle: "", sections: [{ ...sampleSections[0], content: "x".repeat(30_001) }] }),
    /content/i,
  );
});

test("messaging updates reject stale revisions and create a revision newer than the document and database row", () => {
  const current = createMessagingDocument(
    { title: "7-Figure CEO Messaging Bible", subtitle: "Coaching Business With AI", sections: sampleSections },
    "2026-08-27T15:00:00.000Z",
  );

  assert.throws(
    () => updateMessagingDocument(current, { expected_revision: "stale", title: current.title, subtitle: current.subtitle, sections: current.sections }),
    /stale/i,
  );

  const updated = updateMessagingDocument(
    current,
    {
      expected_revision: current.revision,
      title: current.title,
      subtitle: current.subtitle,
      sections: current.sections.map((section) => section.id === "core-domino" ? { ...section, content: "Updated domino." } : section),
    },
    "2026-08-27T15:00:00.000Z",
    "2026-08-27T16:00:00.000Z",
  );

  assert.equal(updated.sections[1].content, "Updated domino.");
  assert.ok(updated.revision > current.revision);
  assert.ok(updated.revision > "2026-08-27T16:00:00.000Z");
});

test("request bodies are rejected while streaming as soon as they exceed the byte limit", async () => {
  const encoder = new TextEncoder();
  const request = new Request("https://salesos.test/api/messaging", {
    method: "PUT",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("12345"));
        controller.enqueue(encoder.encode("67890"));
        controller.close();
      },
    }),
    duplex: "half",
  });

  await assert.rejects(() => readBoundedRequestBody(request, 8), /too large/i);
});

test("Messaging is a first-class one-page Vault tab with editable saved sections", () => {
  const root = new URL("..", import.meta.url);
  const pagePath = new URL("../app/messaging/page.tsx", import.meta.url);
  const routePath = new URL("../app/api/messaging/route.ts", import.meta.url);
  assert.equal(existsSync(pagePath), true);
  assert.equal(existsSync(routePath), true);

  const sidebar = readFileSync(new URL("../components/sidebar.tsx", import.meta.url), "utf8");
  const page = readFileSync(pagePath, "utf8");
  const route = readFileSync(routePath, "utf8");

  assert.match(sidebar, /href: "\/messaging", label: "Messaging"[^\n]+section: "Vault"/);
  assert.match(page, /\/api\/messaging/);
  assert.match(page, /Save changes/);
  assert.match(page, /textarea/);
  assert.match(page, /Jump to section/);
  assert.match(route, /MESSAGING_BIBLE_KEY/);
  assert.match(route, /expected_revision/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
  assert.ok(root);
});

test("Messaging protects in-flight and navigational edits and cannot be bypassed through generic settings", () => {
  const page = readFileSync(new URL("../app/messaging/page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/messaging/route.ts", import.meta.url), "utf8");
  const settingsRoute = readFileSync(new URL("../app/api/settings/route.ts", import.meta.url), "utf8");

  assert.match(page, /disabled=\{saving\}/);
  assert.match(page, /window\.document\.addEventListener\("click"/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /MESSAGING_DRAFT_KEY/);
  assert.match(page, /window\.sessionStorage\.setItem/);
  assert.doesNotMatch(page, /window\.localStorage/);
  assert.match(page, /base_revision/);
  assert.match(route, /readBoundedRequestBody/);
  assert.match(route, /query\.is\("updated_at", null\)/);
  assert.match(route, /stored\?\.updated_at \?\? current\.revision/);
  assert.match(settingsRoute, /MANAGEABLE_SETTINGS_KEY_SET/);
  assert.doesNotMatch(settingsRoute, /MESSAGING_BIBLE_V1/);
});
