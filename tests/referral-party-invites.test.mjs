import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAX_QUEUED_REFERRAL_INVITES,
  MAX_REFERRAL_INVITE_BODY_BYTES,
  agentBearerAuthorized,
  normalizeReferralInviteRegistrant,
  parseInviteCompletion,
  projectQueuedInvite,
  readInviteCompletionBody,
} from "../lib/referral-party-invites.ts";
import { nextParty, partyFor } from "../lib/referral-party.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const EVENT = "8gk1dn0pk1jso1bo86b5sp1v5p_20261008T160000Z";
const bodyRequest = (body) => new Request("https://example.test/api/agent/referral-party-invites", { method: "PATCH", body });

test("new queue rows use the verified current series occurrence", () => {
  const source = readFileSync(new URL("../app/api/leads/referral-party/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /r0mjc229cjidri36bbkbhmfaj0|const SERIES_ID/);
  assert.match(source, /nextParty/);
  assert.match(source, /event_id:\s*party\.eventId/);
  assert.equal(partyFor(2026, 10).eventId, EVENT);
  assert.equal(nextParty(new Date("2026-10-01T12:00:00Z")).eventId, EVENT);
});

test("an in-progress party remains the current signup target until its verified end", () => {
  const occurrence = partyFor(2026, 10);
  const beforeStart = new Date(occurrence.start.getTime() - 1);
  const atStart = occurrence.start;
  const beforeEnd = new Date(occurrence.end.getTime() - 1);
  const atEnd = occurrence.end;
  assert.equal(nextParty(beforeStart).eventId, occurrence.eventId);
  assert.equal(nextParty(atStart).eventId, occurrence.eventId);
  assert.equal(nextParty(beforeEnd).eventId, occurrence.eventId);
  assert.equal(nextParty(atEnd).eventId, partyFor(2026, 11).eventId);
});

test("agent bearer authentication is exact and fails closed", () => {
  assert.equal(agentBearerAuthorized("Bearer agent-secret", "agent-secret"), true);
  for (const value of ["Bearer agent-secret ", "bearer agent-secret", "Bearer wrong", null]) {
    assert.equal(agentBearerAuthorized(value, "agent-secret"), false);
  }
  assert.equal(agentBearerAuthorized("Bearer agent-secret", undefined), false);
});

test("completion accepts only the existing invited or failed database contracts", () => {
  assert.deepEqual(parseInviteCompletion({ id: ID, status: "invited", actual_event_id: EVENT }), { id: ID, status: "invited", actual_event_id: EVENT });
  assert.deepEqual(parseInviteCompletion({ id: ID, status: "failed" }), { id: ID, status: "failed" });
  assert.throws(() => parseInviteCompletion({ id: "bad", status: "invited", actual_event_id: EVENT }), /id/i);
  assert.throws(() => parseInviteCompletion({ id: ID, status: "invited", event_id: EVENT }), /field|actual_event_id/i);
  assert.throws(() => parseInviteCompletion({ id: ID, status: "failed", invited_at: new Date().toISOString() }), /field/i);
  assert.throws(() => parseInviteCompletion({ id: ID, status: "queued" }), /status/i);
});

test("producer normalization matches the worker row contract", () => {
  assert.deepEqual(normalizeReferralInviteRegistrant({ lead_id: " lead-1 ", name: "  ", email: " MARK@EmpoweredMan.co " }), {
    lead_id: "lead-1", name: null, email: "mark@empoweredman.co",
  });
  assert.throws(() => normalizeReferralInviteRegistrant({ email: "mark@localhost" }), /email/i);
  assert.throws(() => normalizeReferralInviteRegistrant({ email: "mark@example.com", name: "x".repeat(201) }), /name/i);
});

test("event id bounds are identical before and after persistence", () => {
  const max = "a".repeat(1024);
  assert.equal(parseInviteCompletion({ id: ID, status: "invited", actual_event_id: max }).actual_event_id.length, 1024);
  assert.equal(projectQueuedInvite({ id: ID, lead_id: null, name: null, email: "mark@example.com", event_date: "2026-10-08", status: "queued", created_at: "2026-10-01T14:00:00.000Z", event_id: max }).event_id.length, 1024);
  assert.throws(() => parseInviteCompletion({ id: ID, status: "invited", actual_event_id: "a".repeat(1025) }), /event_id/i);
});

test("body reader is bounded and rejects duplicate JSON members", async () => {
  assert.deepEqual(await readInviteCompletionBody(bodyRequest(JSON.stringify({ id: ID, status: "invited", actual_event_id: EVENT }))), { id: ID, status: "invited", actual_event_id: EVENT });
  await assert.rejects(() => readInviteCompletionBody(bodyRequest(`{"id":"${ID}","status":"failed","status":"invited"}`)), /duplicate JSON member/i);
  await assert.rejects(() => readInviteCompletionBody(bodyRequest(" ".repeat(MAX_REFERRAL_INVITE_BODY_BYTES + 1))), /too large/i);
});

test("queued projection is strict, normalized, and excludes private fields", () => {
  const row = { id: ID, lead_id: "22222222-2222-4222-8222-222222222222", name: "Mark Santiago", email: "MARK@EmpoweredMan.co", event_date: "2026-10-08", status: "queued", created_at: "2026-10-01T14:00:00.000Z", event_id: EVENT, secret: "no" };
  assert.deepEqual(projectQueuedInvite(row), { id: ID, lead_id: row.lead_id, name: row.name, email: "mark@empoweredman.co", event_date: row.event_date, status: "queued", created_at: row.created_at, event_id: EVENT });
  assert.throws(() => projectQueuedInvite({ ...row, status: "invited" }), /status/i);
  assert.throws(() => projectQueuedInvite({ ...row, email: "bad" }), /email/i);
  assert.throws(() => projectQueuedInvite({ ...row, event_date: "2026-02-30" }), /event_date/i);
});

test("agent route is deterministic, bounded, safe, and compare-and-set protected", () => {
  const source = readFileSync(new URL("../app/api/agent/referral-party-invites/route.ts", import.meta.url), "utf8");
  assert.equal(MAX_QUEUED_REFERRAL_INVITES, 50);
  assert.match(source, /SALESOS_AGENT_KEY/);
  const patchSource = source.slice(source.indexOf("export async function PATCH"));
  assert.match(patchSource, /\.update\(update\)[\s\S]*\.eq\("id", completion\.id\)[\s\S]*\.eq\("status", "queued"\)/);
  assert.match(patchSource, /\.select\("id"\)[\s\S]*\.maybeSingle\(\)/);
  assert.match(source, /\.order\("event_date"/);
  assert.match(source, /\.order\("created_at"/);
  assert.match(source, /\.order\("id"/);
  assert.match(source, /\.limit\(MAX_QUEUED_REFERRAL_INVITES\)/);
  assert.match(source, /actual_event_id/);
  assert.match(source, /status:\s*"invited"/);
  assert.match(source, /status:\s*"failed"/);
  assert.match(source, /const invitedAt = completion\.status === "invited" \? new Date\(\)\.toISOString\(\) : null/);
  assert.doesNotMatch(source, /projectQueuedInvite\(\{ \.{3}data/);
  assert.doesNotMatch(source, /select\("\*"\)/);
});
