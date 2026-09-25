import assert from "node:assert/strict";
import test from "node:test";
import {
  buildShareMessage, callDateLabel, chaptersFromZoomSummary, extractChatLinks, formatStamp, groupByWeek, linkName,
  matchesQuery, mergeLinks, seriesFor, toSeconds, weekOf, windowStart,
} from "../lib/group-call-recap.ts";

// A real chat export from the 18 Aug Claude AI call, trimmed.
const CHAT = [
  "00:03:17\tSY Ventures assistant:\tRecording permission was denied, leaving the meeting.",
  "00:04:45\tAndrew Kroeze:\t7figceo.com/miamievent",
  "00:04:48\tAndrew Kroeze:\tSAVE50",
  "00:06:31\tAndrew Kroeze:\thttps://www.skool.com/claudeaiforfounders/classroom",
  "00:09:39\tAndrew Kroeze:\thttps://www.skool.com/claudeaiforfounders/classroom/",
  "00:28:36\tFireflies.ai Notetaker Andrew Kroeze:\tAndrew Kroeze invited Fireflies.ai here to record & take notes.",
  "View Realtime notes here: https://app.fireflies.ai/live/01M0688Z7SWYR13Y4YJWEATJF1?ref=live_chat",
  "00:31:02\tDan Turner:\tjoin me here https://us02web.zoom.us/j/8681235900 lol",
  "00:40:11\tMaria Morris:\tthis is the one → https://supabase.com/docs.",
].join("\n");

test("the series comes from the weekday when there is no event title", () => {
  assert.equal(seriesFor("2026-09-14"), "laser", "Monday");
  assert.equal(seriesFor("2026-09-15"), "ai", "Tuesday");
  assert.equal(seriesFor("2026-09-24"), "mastermind", "Thursday");
  assert.equal(seriesFor("2026-09-12"), null, "a Saturday is not a group call");
});

test("the Referral Party is not mistaken for the Mastermind it replaced", () => {
  // 10 Sep 2026 was a Thursday, in the Mastermind slot, and was a Referral Party.
  assert.equal(seriesFor("2026-09-10", "🎉 7-Figure CEO Referral Party"), "referral");
  assert.equal(seriesFor("2026-07-31", "🚀 7FCEO Mastermind Session"), "mastermind",
    "the title wins even on a Friday");
  assert.equal(seriesFor("2026-08-17", "🚀 7FCEO Lazer Business Coaching"), "laser", "Lazer is how the calendar spells it");
});

test("links in the chat are found, including a bare domain", () => {
  const links = extractChatLinks(CHAT).map((l) => l.url);
  assert.ok(links.includes("https://7figceo.com/miamievent"), "7figceo.com/miamievent is how it was actually pasted");
  assert.ok(links.includes("https://www.skool.com/claudeaiforfounders/classroom"));
  assert.ok(links.includes("https://supabase.com/docs"), "trailing punctuation is not part of the link");
});

test("the same link pasted twice is listed once, first mention kept", () => {
  const skool = extractChatLinks(CHAT).filter((l) => l.url.includes("skool.com"));
  assert.equal(skool.length, 1, "a trailing slash does not make it a different link");
  assert.equal(skool[0].at, "00:06:31");
  assert.equal(skool[0].sharedBy, "Andrew Kroeze");
});

test("note-taker bots and the meeting's own join link are not resources", () => {
  const links = extractChatLinks(CHAT).map((l) => l.url).join(" ");
  assert.doesNotMatch(links, /fireflies/, "a continuation line is still filtered");
  assert.doesNotMatch(links, /zoom\.us\/j\//);
});

test("the call's own recording is not listed as a link shared on it", () => {
  // Fathom's summary links every bullet to a moment in the recording. Counted as
  // resources, one call showed 36 "links" that were all the call itself.
  const summary = [
    "- [Sonya: 34/50 seats sold](https://fathom.video/share/MABx?tab=summary&timestamp=479.0)",
    "- [Replay](https://us02web.zoom.us/rec/share/abc.def)",
    "- Recommended https://www.skool.com/claudeaiforfounders",
  ].join("\n");
  assert.deepEqual(extractChatLinks(summary).map((l) => l.url), ["https://www.skool.com/claudeaiforfounders"]);
});

test("a note-taker's privacy notice is not a resource", () => {
  const chat = "00:00:05\tSally:\tHi, I take notes. https://sally.io/de/privacy\n00:01:00\tAndrew Kroeze:\thttps://www.hetzner.com/";
  assert.deepEqual(extractChatLinks(chat).map((l) => l.url), ["https://www.hetzner.com/"]);
});

test("a line with no timestamp keeps the sender of the line above", () => {
  const links = extractChatLinks("00:01:00\tAndrew Kroeze:\tresources:\nhttps://claude.ai/download");
  assert.equal(links[0].sharedBy, "Andrew Kroeze");
  assert.equal(links[0].at, "00:01:00");
});

test("an empty or missing chat yields no links rather than failing", () => {
  assert.deepEqual(extractChatLinks(null), []);
  assert.deepEqual(extractChatLinks(""), []);
  assert.deepEqual(extractChatLinks("<?xml version=\"1.0\"?><Error><Code>AccessDenied</Code></Error>"), []);
});

test("merging keeps a label from any list", () => {
  const merged = mergeLinks(
    [{ url: "https://skool.com/x", sharedBy: "Andrew", at: "00:01:00" }],
    [{ url: "https://skool.com/x/", sharedBy: null, at: null, label: "Classroom" }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].label, "Classroom");
  assert.equal(merged[0].at, "00:01:00");
});

test("chapters come from Zoom's summary, in order", () => {
  const chapters = chaptersFromZoomSummary({
    items: [
      { label: "Price Increase Strategy", start_time: "00:16:23.040" },
      { label: "App Demo", start_time: "00:00:00.000" },
      { label: "", start_time: "00:05:00.000" },
      { label: "No time" },
    ],
  });
  assert.deepEqual(chapters.map((c) => c.label), ["App Demo", "Price Increase Strategy"]);
  assert.equal(chapters[1].seconds, 983);
  assert.equal(chapters[1].start, "00:16:23");
});

test("chapters survive junk", () => {
  assert.deepEqual(chaptersFromZoomSummary(null), []);
  assert.deepEqual(chaptersFromZoomSummary({ items: "nope" }), []);
});

test("timestamps read and print the way a player shows them", () => {
  assert.equal(toSeconds("01:04:05"), 3845);
  assert.equal(toSeconds("nope"), null);
  assert.equal(formatStamp(3845), "1:04:05");
  assert.equal(formatStamp(282), "4:42");
});

test("the 60-day window is counted from today", () => {
  assert.equal(windowStart("2026-09-25"), "2026-07-27");
  assert.equal(windowStart("2026-03-01", 1), "2026-02-28");
});

/* ── Presenting the list ── */

const call = {
  id: "c1", call_date: "2026-09-22", call_type: "ai",
  title: "The Five C's of AI Employees",
  summary: "Andrew and Dr. Emeka walked through building AI employees.",
  share_url: "https://us02web.zoom.us/rec/share/abc",
  highlights: ["Start with one job", "Give it memory", "Connect tools", "Test it", "A fifth one"],
  links: [{ url: "https://composio.dev/", sharedBy: "Andrew", at: "00:10:00", label: "Composio" },
    { url: "https://www.skool.com/claudeaiforfounders/classroom", sharedBy: null, at: null }],
  spotlights: [{ name: "Dr. Emeka", topic: "co-led the session" }],
};

test("a date label never slips a day, whatever the machine's timezone", () => {
  assert.equal(callDateLabel("2026-09-22"), "Tue, Sep 22");
});

test("an unlabelled link reads as its site and first path segment", () => {
  assert.equal(linkName(call.links[1]), "skool.com/claudeaiforfounders");
  assert.equal(linkName(call.links[0]), "Composio");
});

test("the share message carries the replay and the links, and no invented text", () => {
  const msg = buildShareMessage(call);
  assert.match(msg, /^🤖 Claude AI \+ Systems for Founders · Tuesday, September 22/);
  assert.match(msg, /Watch the replay: https:\/\/us02web\.zoom\.us\/rec\/share\/abc/);
  assert.match(msg, /• Composio: https:\/\/composio\.dev\//);
  assert.ok(msg.split("\n").filter((l) => l.startsWith("• ") && !l.includes("http")).length === 4,
    "at most four highlights, so it stays readable in WhatsApp");
  assert.doesNotMatch(msg, /\n\n\n/, "no stacked blank lines");
});

test("a call with nothing but a date still makes a sendable message", () => {
  const msg = buildShareMessage({ id: "x", call_date: "2026-09-14", call_type: null, title: null, summary: null, share_url: null });
  assert.match(msg, /Group call · Monday, September 14/);
});

test("search looks through titles, members and links, every word required", () => {
  assert.ok(matchesQuery(call, "emeka"));
  assert.ok(matchesQuery(call, "composio five"));
  assert.ok(matchesQuery(call, "claude ai"), "the series name counts");
  assert.ok(!matchesQuery(call, "composio referral"));
  assert.ok(matchesQuery(call, "   "));
});

test("calls group into weeks starting Monday, newest first", () => {
  assert.equal(weekOf("2026-09-24"), "2026-09-21", "Thursday belongs to Monday's week");
  assert.equal(weekOf("2026-09-21"), "2026-09-21");
  assert.equal(weekOf("2026-09-27"), "2026-09-21", "Sunday closes the week");
  const groups = groupByWeek([{ call_date: "2026-09-14" }, { call_date: "2026-09-24" }, { call_date: "2026-09-22" }]);
  assert.deepEqual(groups.map((g) => g.week), ["2026-09-21", "2026-09-14"]);
  assert.deepEqual(groups[0].calls.map((c) => c.call_date), ["2026-09-24", "2026-09-22"]);
});
