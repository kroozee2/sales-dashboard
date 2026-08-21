import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { applyHotInstagramPatch, mergeHotInstagramSync, parseHotInstagramDocument } from "../lib/hot-leads.ts";

const context = (overrides = {}) => ({
  lead_id: "11111111-1111-4111-8111-111111111111",
  instagram_handle: "qualified.founder",
  chat_id: "chat-123",
  account_id: "account-123",
  messages: [
    { id: "m1", text: "I am looking for implementation help.", is_sender: false, timestamp: "2026-08-21T13:00:00.000Z" },
    { id: "m2", text: "Happy to help. What are you building?", is_sender: true, timestamp: "2026-08-21T13:02:00.000Z" },
  ],
  draft_reply: "That is exactly what we help with. Want me to send you the overview?",
  status: "draft",
  last_error: null,
  sent_at: null,
  updated_at: "2026-08-21T13:05:00.000Z",
  revision: "22222222-2222-4222-8222-222222222222",
  ...overrides,
});

const document = (contexts = [context()]) => ({ version: 1, synced_at: "2026-08-21T13:05:00.000Z", contexts });

test("validates bounded Instagram context for regular SalesOS leads", () => {
  assert.deepEqual(parseHotInstagramDocument(document()), document());
  assert.throws(() => parseHotInstagramDocument(document([context({ messages: Array.from({ length: 21 }, (_, i) => ({ id: `m${i}`, text: "x", is_sender: false, timestamp: "2026-08-21T13:00:00.000Z" })) })])), /20/);
  assert.throws(() => parseHotInstagramDocument(document([context(), context()])), /duplicate lead/i);
  assert.throws(() => parseHotInstagramDocument(document([context(), context({ lead_id: "33333333-3333-4333-8333-333333333333" })])), /duplicate Instagram handle/i);
  assert.throws(() => parseHotInstagramDocument(document([context(), context({ lead_id: "33333333-3333-4333-8333-333333333333", instagram_handle: "another.handle" })])), /duplicate Instagram delivery identity/i);
  assert.throws(() => parseHotInstagramDocument(document([context({ draft_reply: "x".repeat(2001) })])), /draft_reply/i);
});

test("Instagram sync preserves a reviewed draft but resets approval when the thread changes", () => {
  const current = document([context({ status: "approved" })]);
  const unchanged = mergeHotInstagramSync(current, document(), "2026-08-21T14:00:00.000Z");
  assert.equal(unchanged.contexts[0].status, "approved");
  assert.equal(unchanged.contexts[0].draft_reply, context().draft_reply);

  const changed = mergeHotInstagramSync(current, document([context({ messages: [...context().messages, { id: "m3", text: "Can you send it?", is_sender: false, timestamp: "2026-08-21T13:10:00.000Z" }] })]), "2026-08-21T14:00:00.000Z");
  assert.equal(changed.contexts[0].status, "draft");
  assert.match(changed.contexts[0].last_error, /changed/i);

  const sent = document([context({ status: "sent", sent_at: "2026-08-21T13:06:00.000Z" })]);
  const replied = mergeHotInstagramSync(sent, document([context({ messages: [...context().messages, { id: "m4", text: "Yes, please.", is_sender: false, timestamp: "2026-08-21T13:12:00.000Z" }] })]), "2026-08-21T14:00:00.000Z");
  assert.equal(replied.contexts[0].status, "draft");
  assert.equal(replied.contexts[0].draft_reply, "");
  assert.equal(replied.contexts[0].sent_at, null);

  const temporarilyUnmatched = mergeHotInstagramSync(current, document([]), "2026-08-21T14:00:00.000Z", new Set([context().lead_id]));
  assert.equal(temporarilyUnmatched.contexts[0].status, "approved");
  const removedFromHot = mergeHotInstagramSync(current, document([]), "2026-08-21T14:00:00.000Z", new Set());
  assert.equal(removedFromHot.contexts.length, 0);
});

test("approval requires the exact draft and worker transitions are fail-closed", () => {
  const row = context();
  const approved = applyHotInstagramPatch(row, { actor: "browser", status: "approved", expected_draft_reply: row.draft_reply, expected_revision: row.revision }, "2026-08-21T14:00:00.000Z");
  assert.equal(approved.status, "approved");
  assert.throws(() => applyHotInstagramPatch(row, { actor: "browser", status: "approved", expected_draft_reply: "stale", expected_revision: row.revision }, "2026-08-21T14:00:00.000Z"), /stale/i);
  const sending = applyHotInstagramPatch(approved, { actor: "worker", status: "sending", expected_draft_reply: approved.draft_reply, expected_revision: approved.revision }, "2026-08-21T14:01:00.000Z");
  const sent = applyHotInstagramPatch(sending, { actor: "worker", status: "sent", expected_revision: sending.revision }, "2026-08-21T14:02:00.000Z");
  assert.equal(sent.sent_at, "2026-08-21T14:02:00.000Z");
});

test("Hot is a Leads sub-tab backed by the regular 50-lead list", () => {
  const tabs = readFileSync(new URL("../components/sub-tabs.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/hot-leads/page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/hot-leads/route.ts", import.meta.url), "utf8");
  assert.match(tabs, /href:\s*["']\/hot-leads["'],\s*label:\s*["']Hot["']/);
  assert.match(route, /\.or\([\s\S]{0,150}hot\.eq\.true[\s\S]{0,150}prospect_stage\.eq/);
  assert.match(route, /\.limit\(50\)/);
  assert.match(page, /Remove from Hot/);
  assert.match(page, /\/api\/leads\/\$\{row\.id\}\/hot/);
});

test("dedicated worker key is scoped to one exact Hot Instagram context PATCH", async () => {
  const { bearerAuthorizedForRequest } = await import("../lib/proxy-auth.ts");
  const keys = { agentKey: "agent-secret", workerKey: "worker-secret" };
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(bearerAuthorizedForRequest("PATCH", `/api/hot-leads/current/${id}`, "Bearer worker-secret", keys), true);
  assert.equal(bearerAuthorizedForRequest("GET", `/api/hot-leads/current/${id}`, "Bearer worker-secret", keys), false);
  assert.equal(bearerAuthorizedForRequest("PATCH", "/api/hot-leads/current/manual-lead_123", "Bearer worker-secret", keys), true);
  assert.equal(bearerAuthorizedForRequest("PATCH", "/api/hot-leads/current/bad%2Fid", "Bearer worker-secret", keys), false);
  assert.equal(bearerAuthorizedForRequest("PATCH", `/api/leads/${id}/hot`, "Bearer worker-secret", keys), false);
});

test("regular Leads already exposes add/remove Hot controls", () => {
  const page = readFileSync(new URL("../app/leads/page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/leads/[id]/hot/route.ts", import.meta.url), "utf8");
  assert.match(page, /Add to Hot/);
  assert.match(page, /method:\s*next\s*\?\s*["']POST["']\s*:\s*["']DELETE["']/);
  assert.match(route, /update\(\{\s*hot:\s*true/);
  assert.match(route, /prospect_stage/);
});

test("Hot page shows pulled Instagram history and previews exact copy before approval", () => {
  const page = readFileSync(new URL("../app/hot-leads/page.tsx", import.meta.url), "utf8");
  const collection = readFileSync(new URL("../app/api/hot-leads/route.ts", import.meta.url), "utf8");
  const member = readFileSync(new URL("../app/api/hot-leads/[date]/[id]/route.ts", import.meta.url), "utf8");
  assert.match(page, /Instagram conversation/);
  assert.match(page, /window\.confirm\([\s\S]{0,400}draft_reply/);
  assert.match(page, /Send on Instagram/);
  assert.match(collection, /isHotLeadsOwner/);
  assert.match(collection, /publicHotInstagramContext/);
  assert.match(member, /Lead is no longer Hot/);
  assert.doesNotMatch(page, /UNIPILE_API_KEY|X-API-KEY|chat_id|account_id/);
});

test("removal revokes queued Instagram approval before compare-and-set stage demotion", () => {
  const route = readFileSync(new URL("../app/api/leads/[id]/hot/route.ts", import.meta.url), "utf8");
  assert.match(route, /context\?\.status === ["']sending["']/);
  assert.match(route, /contexts\.filter\(\(row\) => row\.lead_id !== id\)/);
  assert.match(route, /update\.is\(["']prospect_stage["'], null\)|update\.eq\(["']prospect_stage["']/);
});
