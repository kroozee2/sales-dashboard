import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { matchHelmCall, outstanding, resolveAttendance, titleKey } from "../lib/group-calls.ts";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const helmCall = (o = {}) => ({ id: "h1", title: "☎️ Claude AI + Systems for Founders Call", call_date: "2026-09-08", starts_at: null, attended: null, names: [], ...o });

test("nothing recorded is reported as nothing, not as zero", () => {
  // The board read "0 showed up" on a call that ran 56 minutes. A zero meaning
  // "we never looked" reads exactly like a zero meaning "nobody came", and only
  // one of those is worth panicking about.
  const a = resolveAttendance({ attendees: [], attendee_count: null }, null);
  assert.equal(a.count, null);
  assert.equal(a.source, "none");
  assert.equal(a.label, "Not recorded");
});

test("a zero somebody actually recorded is kept", () => {
  const a = resolveAttendance({ attendees: [], attendee_count: 0 }, null);
  assert.equal(a.count, 0);
  assert.equal(a.source, "recorded-here");
});

test("named attendees beat a bare headcount", () => {
  const a = resolveAttendance({ attendees: [], attendee_count: null },
    helmCall({ attended: 4, names: [{ name: "Ben Stein" }, { name: "Arely Zarate" }] }));
  assert.equal(a.source, "helm-named");
  assert.equal(a.count, 4, "the headcount is the truth about how many; the names are who we know of");
  assert.match(a.label, /4 on the call, 2 named/);
});

test("a headcount with no names still beats nothing", () => {
  const a = resolveAttendance({ attendees: [], attendee_count: null }, helmCall({ attended: 9 }));
  assert.equal(a.count, 9);
  assert.equal(a.source, "helm-count");
  assert.deepEqual(a.names, []);
});

test("a blank name is not an attendee", () => {
  const a = resolveAttendance({ attendees: [{ name: "   " }], attendee_count: null }, null);
  assert.equal(a.source, "none");
});

test("titles match across the two apps' emoji and punctuation", () => {
  assert.equal(titleKey("☎️ Claude AI + Systems for Founders Call"), titleKey("Claude AI  Systems for Founders Call"));
  assert.equal(titleKey("🚀 7FCEO Laser Business Coaching"), "7fceo laser business coaching");
});

test("a week with two group calls matches on title, not just the day", () => {
  const row = { call_date: "2026-09-08", title: "Claude AI + Systems for Founders Call" };
  const matched = matchHelmCall(row, [
    helmCall({ id: "coaching", title: "🚀 7FCEO Laser Business Coaching" }),
    helmCall({ id: "founders", title: "☎️ Claude AI + Systems for Founders Call" }),
  ]);
  assert.equal(matched.id, "founders");
});

test("one call that day needs no title at all", () => {
  const matched = matchHelmCall({ call_date: "2026-09-08", title: null }, [helmCall({ id: "only" })]);
  assert.equal(matched.id, "only");
});

test("a call on another day is never matched", () => {
  assert.equal(matchHelmCall({ call_date: "2026-09-15", title: "x" }, [helmCall()]), null);
});

test("missing attendance is listed as outstanding work", () => {
  const open = outstanding(
    { recording_sent: false, fam_sent_at: null, mastermind_sent_at: null, fam_draft: "hi", mastermind_draft: null },
    { count: null, names: [], source: "none", label: "Not recorded" },
  );
  assert.deepEqual(open, ["attendance", "recording", "Fam post"]);
});

test("a finished call has nothing outstanding", () => {
  const open = outstanding(
    { recording_sent: true, fam_sent_at: "2026-09-09T00:00:00Z", mastermind_sent_at: null, fam_draft: "hi", mastermind_draft: null },
    { count: 9, names: [], source: "helm-count", label: "9 on the call" },
  );
  assert.deepEqual(open, []);
});

test("the speaker-matching filter that always returned nobody is gone", () => {
  // 178 invitees on the latest call, and matched_speaker_display_name is null
  // on every one. Listening is not speaking.
  const route = read("../app/api/client-calls/route.ts");
  assert.match(route, /helmGroupCalls/);
  assert.match(route, /resolveAttendance/);
  assert.doesNotMatch(route, /matched_speaker_display_name/);
});

test("a headcount typed by hand is validated, not written blindly", () => {
  const route = read("../app/api/client-calls/route.ts");
  assert.match(route, /"attendee_count"/);
  assert.match(route, /must be a number that is not negative/);
});
