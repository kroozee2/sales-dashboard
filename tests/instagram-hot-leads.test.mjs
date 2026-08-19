import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyInstagramHotLeadPatch,
  parseInstagramHotLeadsDocument,
  replaceInstagramHotLeads,
} from "../lib/instagram-hot-leads.ts";
import { bearerAuthorizedForRequest } from "../lib/proxy-auth.ts";

const lead = (overrides = {}) => ({
  rank: 1,
  username: "qualified.founder",
  display_name: "Qualified Founder",
  updated_time: "2026-08-18T10:00:00.000Z",
  heat_score: 92,
  heat_reason: "Asked about implementation support.",
  relevant_offer: "7-Figure Circle",
  latest_inbound_summary: "Wants help installing a calmer operating system.",
  salesos_match: "Qualified Founder",
  salesos_lead_id: "lead-123",
  conversation_id: "conversation-123",
  recipient_id: "recipient-123",
  provider_account_id: "account-123",
  draft_reply: "Absolutely — want me to send the details?",
  status: "draft",
  last_error: null,
  sent_at: null,
  updated_at: "2026-08-18T10:05:00.000Z",
  revision: "11111111-1111-4111-8111-111111111111",
  ...overrides,
});

const document = (leads = [lead()]) => ({
  generated_at: "2026-08-18T10:05:00.000Z",
  leads,
});

test("accepts an exact bounded Instagram hot-leads document", () => {
  assert.deepEqual(parseInstagramHotLeadsDocument(document()), document());
  assert.equal(parseInstagramHotLeadsDocument(document([lead({ salesos_match: "x".repeat(1000) })])).leads[0].salesos_match.length, 1000);
  assert.equal(parseInstagramHotLeadsDocument(document(Array.from({ length: 50 }, (_, i) => lead({ rank: i + 1, username: `lead.${i}` })))).leads.length, 50);
});

test("rejects invalid usernames, oversized messages, duplicate usernames, extra fields, and more than 50 leads", () => {
  assert.throws(() => parseInstagramHotLeadsDocument(document([lead({ username: "@not-allowed" })])), /username/i);
  assert.throws(() => parseInstagramHotLeadsDocument(document([lead({ draft_reply: "x".repeat(2001) })])), /draft_reply/i);
  assert.throws(() => parseInstagramHotLeadsDocument(document([lead(), lead({ rank: 2, username: "QUALIFIED.FOUNDER" })])), /duplicate/i);
  assert.throws(() => parseInstagramHotLeadsDocument(document([lead(), lead({ username: "different" })])), /duplicate rank/i);
  assert.throws(() => parseInstagramHotLeadsDocument({ ...document(), unexpected: true }), /unexpected/i);
  assert.throws(() => parseInstagramHotLeadsDocument(document(Array.from({ length: 51 }, (_, i) => lead({ rank: i + 1, username: `lead.${i}` })))), /50/);
});

test("replacement rejects every import while a current send is in flight", () => {
  const current = document([lead({ status: "sending" })]);
  const incoming = document([lead({ status: "draft", recipient_id: "replacement-recipient" })]);

  assert.throws(
    () => replaceInstagramHotLeads(current, incoming, "2026-08-18T11:00:00.000Z"),
    /sending|in flight|conflict/i,
  );
});

test("replacement preserves sent only for the same username, exact draft, recipient, conversation, and provider account", () => {
  const sent = lead({ status: "sent", sent_at: "2026-08-18T10:10:00.000Z" });
  const current = document([sent]);

  const preserved = replaceInstagramHotLeads(current, document([lead()]), "2026-08-18T11:00:00.000Z");
  assert.equal(preserved.leads[0].status, "sent");
  assert.equal(preserved.leads[0].sent_at, sent.sent_at);
  assert.equal(preserved.leads[0].revision, sent.revision);

  for (const changed of [
    { draft_reply: "Changed exact draft" },
    { recipient_id: "replacement-recipient" },
    { conversation_id: "replacement-conversation" },
    { provider_account_id: "replacement-account" },
  ]) {
    const replaced = replaceInstagramHotLeads(current, document([lead(changed)]), "2026-08-18T11:00:00.000Z");
    assert.equal(replaced.leads[0].status, "draft");
    assert.equal(replaced.leads[0].sent_at, null);
    assert.equal(replaced.leads[0].last_error, null);
    assert.notEqual(replaced.leads[0].revision, sent.revision);
  }
});

test("browser approval requires the exact current draft and collision-resistant revision", () => {
  const row = lead({ status: "failed", last_error: "Provider unavailable" });
  const approved = applyInstagramHotLeadPatch(row, {
    actor: "browser",
    status: "approved",
    expected_draft_reply: row.draft_reply,
    expected_revision: row.revision,
  }, "2026-08-18T11:00:00.000Z");
  assert.equal(approved.status, "approved");
  assert.equal(approved.last_error, null);

  assert.throws(() => applyInstagramHotLeadPatch(row, {
    actor: "browser",
    status: "approved",
    expected_draft_reply: row.draft_reply,
  }, "2026-08-18T11:00:00.000Z"), /expected_revision/i);

  assert.throws(() => applyInstagramHotLeadPatch(row, {
    actor: "browser",
    status: "approved",
    expected_draft_reply: row.draft_reply,
    expected_revision: "22222222-2222-4222-8222-222222222222",
  }, "2026-08-18T11:00:00.000Z"), /stale/i);
});

test("enforces worker claim and completion transitions with optimistic concurrency", () => {
  const approved = lead({ status: "approved" });
  const sending = applyInstagramHotLeadPatch(approved, {
    actor: "worker",
    status: "sending",
    expected_revision: approved.revision,
    expected_draft_reply: approved.draft_reply,
  }, "2026-08-18T11:00:00.000Z");
  assert.equal(sending.status, "sending");

  const sent = applyInstagramHotLeadPatch(sending, {
    actor: "worker",
    status: "sent",
    expected_revision: sending.revision,
  }, "2026-08-18T11:01:00.000Z");
  assert.equal(sent.sent_at, "2026-08-18T11:01:00.000Z");

  assert.throws(() => applyInstagramHotLeadPatch(approved, {
    actor: "worker",
    status: "sending",
    expected_revision: "22222222-2222-4222-8222-222222222222",
    expected_draft_reply: approved.draft_reply,
  }, "2026-08-18T11:00:00.000Z"), /stale/i);
  assert.throws(() => applyInstagramHotLeadPatch(approved, { actor: "worker", status: "sent", expected_revision: approved.revision }, "2026-08-18T11:00:00.000Z"), /transition/i);
  assert.throws(() => applyInstagramHotLeadPatch(approved, { actor: "browser", status: "sending", expected_draft_reply: approved.draft_reply }, "2026-08-18T11:00:00.000Z"), /transition/i);
});

test("saving a changed draft resets failed or approved work to draft and rejects edits while sending or sent", () => {
  const saved = applyInstagramHotLeadPatch(lead({ status: "approved" }), {
    actor: "browser",
    draft_reply: "Updated exact draft",
    expected_revision: "11111111-1111-4111-8111-111111111111",
  }, "2026-08-18T11:00:00.000Z");
  assert.equal(saved.status, "draft");
  assert.equal(saved.draft_reply, "Updated exact draft");

  assert.throws(() => applyInstagramHotLeadPatch(lead({ status: "sending" }), {
    actor: "browser",
    draft_reply: "Do not race an active send",
    expected_revision: "11111111-1111-4111-8111-111111111111",
  }, "2026-08-18T11:00:00.000Z"), /sending/i);
});

test("adds IG Hot Leads to the Leads sub-tabs and renders a queue-only approval page", () => {
  const tabs = readFileSync(new URL("../components/sub-tabs.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/instagram-hot-leads/page.tsx", import.meta.url), "utf8");
  assert.match(tabs, /href:\s*["']\/instagram-hot-leads["'],\s*label:\s*["']IG Hot Leads["']/);
  assert.match(page, /<SubTabs group=["']leads["']/);
  assert.match(page, /Send on Instagram/);
  assert.match(page, /window\.confirm\([\s\S]{0,300}username[\s\S]{0,300}draft_reply/);
  assert.match(page, /status:\s*["']approved["'][\s\S]{0,200}expected_draft_reply:\s*row\.draft_reply[\s\S]{0,200}expected_revision:\s*row\.revision/);
  assert.match(page, /within about a minute/i);
  assert.match(page, /\/api\/instagram-hot-leads/);
  assert.doesNotMatch(page, /api\/messages\/send|composio/i);
  assert.doesNotMatch(page, /conversation_id|recipient_id|provider_account_id/);
});

test("same-timestamp identity replacements change revision and reject stale approval", () => {
  const row = lead();
  for (const changed of [
    { recipient_id: "new-recipient" },
    { conversation_id: "new-conversation" },
    { provider_account_id: "new-account" },
  ]) {
    const replaced = replaceInstagramHotLeads(document([row]), document([lead(changed)]), row.updated_at);
    assert.equal(replaced.leads[0].updated_at, row.updated_at);
    assert.notEqual(replaced.leads[0].revision, row.revision);
    assert.throws(() => applyInstagramHotLeadPatch(replaced.leads[0], {
      actor: "browser",
      status: "approved",
      expected_draft_reply: replaced.leads[0].draft_reply,
      expected_revision: row.revision,
    }, row.updated_at), /stale/i);
  }
});

test("dedicated worker bearer is scoped to exact encoded member PATCH requests", () => {
  const keys = { agentKey: "generic-secret", workerKey: "worker-secret" };
  assert.equal(bearerAuthorizedForRequest("PATCH", "/api/instagram-hot-leads/alice%2Esmith", "Bearer worker-secret", keys), true);
  for (const [method, pathname] of [
    ["GET", "/api/instagram-hot-leads/alice"],
    ["PATCH", "/api/instagram-hot-leads"],
    ["PATCH", "/api/instagram-hot-leads/alice/nested"],
    ["PATCH", "/api/tasks/alice"],
  ]) assert.equal(bearerAuthorizedForRequest(method, pathname, "Bearer worker-secret", keys), false);
  assert.equal(bearerAuthorizedForRequest("PUT", "/api/instagram-hot-leads", "Bearer generic-secret", keys), true);
  assert.equal(bearerAuthorizedForRequest("GET", "/api/tasks", "Bearer generic-secret", keys), true);
  assert.equal(bearerAuthorizedForRequest("PATCH", "/api/instagram-hot-leads/alice", "Bearer worker-secret", { agentKey: "generic-secret" }), false);
});

test("defines bounded GET, PUT, and PATCH route handlers without an outbound provider", () => {
  const collection = readFileSync(new URL("../app/api/instagram-hot-leads/route.ts", import.meta.url), "utf8");
  const member = readFileSync(new URL("../app/api/instagram-hot-leads/[username]/route.ts", import.meta.url), "utf8");
  assert.match(collection, /export async function GET/);
  assert.match(collection, /export async function PUT/);
  assert.match(member, /export async function PATCH/);
  assert.match(collection + member, /content-length/i);
  assert.match(collection + member, /INSTAGRAM_HOT_LEADS_MAX_BODY_BYTES/);
  assert.match(member, /process\.env\.INSTAGRAM_HOT_LEADS_WORKER_KEY/);
  assert.match(member, /timingSafeEqual/);
  assert.doesNotMatch(member, /process\.env\.SALESOS_AGENT_KEY/);
  assert.doesNotMatch(collection + member, /composio|send_message|messages\/send/i);
});
