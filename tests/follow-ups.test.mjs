import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  intelSourceFor,
  isIntelEmpty,
  needsFollowUp,
  parseCallIntel,
  rankFollowUps,
  scoreCall,
} from "../lib/follow-ups.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const NOW = new Date("2026-09-08T18:00:00.000Z");

const call = (overrides = {}) => ({
  id: "call-1",
  name: "Sergio Silesky",
  call_date: "2026-09-07T20:30:00+00:00",
  call_type: "📞 Sales Call",
  result: "📣 Follow Up",
  showed: true,
  success: false,
  offer: "BOARDROOM",
  offer_made: true,
  deal_amount: 15000,
  prospect_quality: null,
  objections: [],
  objections_notes: null,
  call_notes: null,
  ai_summary: null,
  follow_up_status: null,
  follow_up_date: null,
  follow_up_notes: null,
  recording_url: null,
  fathom_call_id: null,
  email: "sergio@example.com",
  phone: null,
  ghl_url: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Who belongs on the board
// ---------------------------------------------------------------------------

test("a closed deal never appears on the follow-up board", () => {
  assert.equal(needsFollowUp(call({ success: true })), false);
  assert.equal(needsFollowUp(call({ result: "✅ Sale" })), false);
  assert.equal(needsFollowUp(call({ result: "✅ Completed" })), false);
});

test("a no-show is excluded because there was no conversation to mine", () => {
  assert.equal(needsFollowUp(call({ result: "👻 No Show" })), false);
});

// The `showed` column reads false on calls that plainly happened, so trusting
// it dropped exactly the people worth chasing.
test("a recorded outcome outranks the unreliable showed flag", () => {
  assert.equal(needsFollowUp(call({ showed: false, result: "📣 Follow Up" })), true);
  assert.equal(needsFollowUp(call({ showed: false, result: "❌ Did Not Close" })), true);
  assert.equal(needsFollowUp(call({ showed: false, result: "👻 No Show" })), false, "an explicit no-show still counts");
});

test("with no outcome at all, some evidence of a conversation is required", () => {
  assert.equal(needsFollowUp(call({ result: null, showed: false })), false, "an unlabelled, unrecorded call is not a follow-up");
  assert.equal(needsFollowUp(call({ result: null, showed: false, call_notes: "They want more leads." })), true);
  assert.equal(needsFollowUp(call({ result: null, showed: false, recording_url: "https://fathom.video/calls/1" })), true);
});

test("one person appears once, on their most recent call", () => {
  const ranked = rankFollowUps([
    call({ id: "old", name: "Linda Kim", email: "linda@example.com", call_date: "2026-09-07T18:20:00Z" }),
    call({ id: "new", name: "Linda Kim", email: "linda@example.com", call_date: "2026-09-08T18:20:00Z" }),
    call({ id: "other", name: "Sergio Silesky", email: "sergio@example.com" }),
  ], NOW);
  assert.equal(ranked.filter((r) => r.call.name === "Linda Kim").length, 1);
  assert.equal(ranked.find((r) => r.call.name === "Linda Kim")?.call.id, "new");
  assert.equal(ranked.length, 2);
});

test("an upcoming call is not a follow-up yet", () => {
  assert.equal(needsFollowUp(call({ result: "🔜 Upcoming" })), false);
});

test("the people worth chasing are included", () => {
  assert.equal(needsFollowUp(call({ result: "📣 Follow Up" })), true);
  assert.equal(needsFollowUp(call({ result: "❌ Did Not Close" })), true);
});

// ---------------------------------------------------------------------------
// Scoring is explainable
// ---------------------------------------------------------------------------

test("every point awarded carries a reason in plain language", () => {
  const scored = scoreCall(call(), NOW);
  assert.equal(scored.reasons.length > 0, true);
  assert.equal(scored.score, scored.reasons.reduce((sum, r) => sum + r.points, 0));
  for (const reason of scored.reasons) {
    assert.equal(typeof reason.because, "string");
    assert.equal(reason.because.length > 0, true);
    assert.equal(reason.points > 0, true, "a zero-point reason would be noise");
  }
});

test("reasons are ordered by weight so the biggest factor reads first", () => {
  const scored = scoreCall(call({ objections: ["⏰ Timing / Not Right Now"] }), NOW);
  const points = scored.reasons.map((r) => r.points);
  assert.deepEqual(points, [...points].sort((a, b) => b - a));
});

test("a fresh follow-up outranks an old one, all else equal", () => {
  const fresh = scoreCall(call({ call_date: "2026-09-07T20:30:00Z" }), NOW);
  const stale = scoreCall(call({ call_date: "2026-07-01T20:30:00Z" }), NOW);
  assert.equal(fresh.score > stale.score, true);
  assert.match(fresh.reasons.map((r) => r.because).join(" "), /1 day ago/);
});

test("asking for a follow-up counts for more than saying no", () => {
  const asked = scoreCall(call({ result: "📣 Follow Up" }), NOW);
  const declined = scoreCall(call({ result: "❌ Did Not Close" }), NOW);
  assert.equal(asked.score > declined.score, true);
});

test("a timing objection is warmer than being committed elsewhere", () => {
  const timing = scoreCall(call({ objections: ["⏰ Timing / Not Right Now"] }), NOW);
  const taken = scoreCall(call({ objections: ["🏆 Already Working With Someone Else"] }), NOW);
  assert.equal(timing.score > taken.score, true);
  assert.match(timing.reasons.map((r) => r.because).join(" "), /timing, not fit/i);
});

test("only the most recoverable objection scores, not every one stacked", () => {
  const many = scoreCall(call({ objections: ["💰 Price / Can't Afford It", "⏰ Timing / Not Right Now", "🤔 Need to Think About It"] }), NOW);
  const one = scoreCall(call({ objections: ["⏰ Timing / Not Right Now"] }), NOW);
  assert.equal(many.score, one.score, "objections do not compound");
});

test("a due follow-up date raises the score and says so", () => {
  const due = scoreCall(call({ follow_up_date: "2026-09-08" }), NOW);
  const notDue = scoreCall(call({ follow_up_date: "2026-12-01" }), NOW);
  assert.equal(due.score > notDue.score, true);
  assert.match(due.reasons.map((r) => r.because).join(" "), /follow-up date has arrived/i);
});

test("the score is capped and banded", () => {
  const loaded = scoreCall(call({
    objections: ["⏰ Timing / Not Right Now"],
    follow_up_date: "2026-09-01",
    prospect_quality: "High",
  }), NOW);
  assert.equal(loaded.score <= 100, true);
  assert.equal(loaded.band, "hot");
  assert.equal(scoreCall(call({ result: "❌ Did Not Close", showed: null, offer_made: null, deal_amount: null, call_date: "2026-01-01T00:00:00Z" }), NOW).band, "cool");
});

test("a call dated in the future does not earn recency points", () => {
  const future = scoreCall(call({ call_date: "2026-12-25T00:00:00Z" }), NOW);
  assert.doesNotMatch(future.reasons.map((r) => r.because).join(" "), /days ago|was today/);
});

test("ranking puts the hottest first and drops everyone who does not belong", () => {
  const ranked = rankFollowUps([
    call({ id: "closed", name: "Closed Deal", email: "closed@example.com", success: true }),
    call({ id: "cold", name: "Cold Lead", email: "cold@example.com", result: "❌ Did Not Close", offer_made: false, deal_amount: null, call_date: "2026-02-01T00:00:00Z" }),
    call({ id: "hot", name: "Hot Lead", email: "hot@example.com", result: "📣 Follow Up", objections: ["⏰ Timing / Not Right Now"] }),
    call({ id: "noshow", name: "No Show", email: "noshow@example.com", result: "👻 No Show" }),
  ], NOW);
  assert.deepEqual(ranked.map((r) => r.call.id), ["hot", "cold"]);
  assert.equal(ranked[0].score > ranked[1].score, true);
});

test("ties break toward the more recent call", () => {
  const ranked = rankFollowUps([
    call({ id: "older", name: "A Person", email: "a@example.com", call_date: "2026-09-07T01:00:00Z" }),
    call({ id: "newer", name: "B Person", email: "b@example.com", call_date: "2026-09-07T23:00:00Z" }),
  ], NOW);
  assert.deepEqual(ranked.map((r) => r.call.id), ["newer", "older"]);
});

// ---------------------------------------------------------------------------
// Extracted intel, and being honest about where it came from
// ---------------------------------------------------------------------------

test("intel is normalised, de-duplicated, and bounded", () => {
  const intel = parseCallIntel({
    pains: ["  Leads   are   inconsistent ", "Leads are inconsistent", "", "x".repeat(400)],
    goals: ["Hit $50k months"],
    challenges: null,
    wants: ["A predictable system"],
    objections: ["Timing"],
    in_their_words: ["I just need this to be repeatable"],
  }, "recording");
  assert.deepEqual(intel.pains, ["Leads are inconsistent", `${"x".repeat(299)}…`]);
  assert.deepEqual(intel.challenges, []);
  assert.equal(intel.source, "recording");
});

test("confidence reflects how much was recovered, not how sure the model sounded", () => {
  const full = { pains: ["a"], goals: ["b"], challenges: ["c"], wants: ["d"], objections: ["e"] };
  assert.equal(parseCallIntel(full, "recording").confidence, "high");
  assert.equal(parseCallIntel(full, "notes").confidence, "medium", "typed notes never claim high confidence");
  assert.equal(parseCallIntel({ pains: ["a"] }, "recording").confidence, "low");
});

test("a malformed field is rejected rather than silently mangled", () => {
  assert.throws(() => parseCallIntel({ pains: "not a list" }, "notes"), /pains must be an array/);
  assert.throws(() => parseCallIntel({ goals: [42] }, "notes"), /goals must contain strings/);
  assert.throws(() => parseCallIntel(null, "notes"), /must be an object/);
});

test("an empty readout is detectable so the page can say so", () => {
  assert.equal(isIntelEmpty(parseCallIntel({}, "none")), true);
  assert.equal(isIntelEmpty(parseCallIntel({ pains: ["Something"] }, "notes")), false);
});

test("the source is decided by what actually exists on the call", () => {
  assert.equal(intelSourceFor(call({ fathom_call_id: "abc" })), "recording");
  assert.equal(intelSourceFor(call({ recording_url: "https://fathom.video/calls/123" })), "recording");
  assert.equal(intelSourceFor(call({ recording_url: "https://us02web.zoom.us/rec/x", call_notes: "They want more leads." })), "notes", "a Zoom link cannot be read, so it is not a recording source");
  assert.equal(intelSourceFor(call({ recording_url: "https://us02web.zoom.us/rec/x" })), "none", "an unreadable recording with no notes gives us nothing");
  assert.equal(intelSourceFor(call({ ai_summary: "They want more leads." })), "notes");
  assert.equal(intelSourceFor(call()), "none");
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

test("Follow-Ups is a Sales sidebar destination", () => {
  const sidebar = read("../components/sidebar.tsx");
  assert.match(sidebar, /href: "\/follow-ups", label: "Follow-Ups".*section: "Sales"/);
});

test("the page never presents a guess as if it were a transcript", () => {
  const workspace = read("../app/follow-ups/follow-ups-workspace.tsx");
  assert.match(workspace, /from the recording|from typed notes/i);
  assert.match(workspace, /No recording/i);
});

// ---------------------------------------------------------------------------
// Matching an unlinked call to its recording
// ---------------------------------------------------------------------------

const { matchMeeting, toLite } = await import("../lib/fathom-transcript.ts");

const meeting = (overrides = {}) => ({
  recording_id: 1,
  title: "Sales Call with Sergio Silesky",
  recording_start_time: "2026-09-07T20:35:00Z",
  share_url: "https://fathom.video/share/abc",
  invitee_names: ["Andrew Kroeze", "Sergio Silesky"],
  invitee_emails: ["andrew@reprogrammingproject.com", "sergio@example.com"],
  ...overrides,
});

test("an email match is proof enough on its own", () => {
  const found = matchMeeting(
    { name: "Totally Different Name", email: "sergio@example.com", call_date: null },
    [meeting(), meeting({ recording_id: 2, invitee_emails: ["someone@else.com"] })],
  );
  assert.equal(found?.recording_id, 1);
});

test("two recordings for the same email pick the one nearest the call time", () => {
  const found = matchMeeting(
    { name: null, email: "sergio@example.com", call_date: "2026-09-07T20:30:00Z" },
    [meeting({ recording_id: 9, recording_start_time: "2026-08-01T20:35:00Z" }), meeting({ recording_id: 4 })],
  );
  assert.equal(found?.recording_id, 4);
});

test("a name match needs the clock to agree", () => {
  const sameDay = matchMeeting({ name: "Sergio Silesky", email: null, call_date: "2026-09-07T20:30:00Z" }, [meeting()]);
  assert.equal(sameDay?.recording_id, 1);
  const wrongDay = matchMeeting({ name: "Sergio Silesky", email: null, call_date: "2026-06-07T20:30:00Z" }, [meeting()]);
  assert.equal(wrongDay, null);
});

test("an ambiguous name match attaches nothing rather than the wrong transcript", () => {
  const found = matchMeeting({ name: "Sergio Silesky", email: null, call_date: "2026-09-07T20:30:00Z" }, [
    meeting({ recording_id: 1 }),
    meeting({ recording_id: 2, title: "Follow-up with Sergio Silesky" }),
  ]);
  assert.equal(found, null);
});

test("a group call is not mistaken for a one-to-one", () => {
  const found = matchMeeting({ name: "Sergio Silesky", email: null, call_date: "2026-09-07T16:30:00Z" }, [
    { ...meeting({ recording_id: 7, title: "7FCEO Lazer Business Coaching" }), invitee_names: ["Andrew Kroeze", "Doc Ertas"], invitee_emails: [] },
  ]);
  assert.equal(found, null);
});

test("no name and no email matches nothing", () => {
  assert.equal(matchMeeting({ name: null, email: null, call_date: "2026-09-07T20:30:00Z" }, [meeting()]), null);
});

test("a raw Fathom payload reduces to the fields matching needs", () => {
  const lite = toLite({
    recording_id: 55,
    title: "Call",
    recording_start_time: "2026-09-07T20:35:00Z",
    share_url: "https://fathom.video/share/x",
    calendar_invitees: [{ name: "Linda Kim", email: "linda@example.com" }, { name: null, email: null }],
  });
  assert.equal(lite.recording_id, 55);
  assert.deepEqual(lite.invitee_names, ["Linda Kim"]);
  assert.deepEqual(lite.invitee_emails, ["linda@example.com"]);
});

test("a Fathom recording id is recovered from a pasted URL, not just the linked field", async () => {
  const { fathomRecordingId } = await import("../lib/follow-ups.ts");
  assert.equal(fathomRecordingId({ fathom_call_id: "180541998", recording_url: null }), 180541998);
  assert.equal(fathomRecordingId({ fathom_call_id: null, recording_url: "https://fathom.video/calls/811639699" }), 811639699);
  assert.equal(fathomRecordingId({ fathom_call_id: null, recording_url: "https://fathom.video/share/segYrsvHz553" }), null, "a share token is not a recording id");
  assert.equal(fathomRecordingId({ fathom_call_id: null, recording_url: "https://us02web.zoom.us/rec/x" }), null);
  assert.equal(fathomRecordingId({ fathom_call_id: null, recording_url: null }), null);
});

test("the analyser only claims a recording when it actually holds one", () => {
  const route = read("../app/api/follow-ups/analyze/route.ts");
  assert.match(route, /let source: IntelSource = "none";/);
  assert.match(route, /if \(transcript \|\| summary\) \{\s*\n\s*source = "recording";/);
  assert.doesNotMatch(route, /let source: IntelSource = intelSourceFor/, "presence of a link is not proof of a transcript");
});
