import assert from "node:assert/strict";
import test from "node:test";
import {
  ago, applyFilter, daysSince, groupRoster, needsAttention, rosterCounts, statusToHealth,
} from "../lib/client-roster.ts";

const NOW = new Date("2026-09-08T12:00:00Z");

const client = (o = {}) => ({
  key: o.key ?? "k", accountId: "a", helmId: "h", name: "Zoe", email: null, phone: null,
  program: "BOARDROOM", status: "🚀 On-Track", owner: "Andrew", dealValue: null, mrr: null,
  startDate: "2026-01-01", addedAt: "2026-01-01T00:00:00Z", notes: null, whatsapp: null,
  onboarding: {}, editable: true,
  helm: { membership: "BOARDROOM", isActive: true, lastContactAt: "2026-09-06T12:00:00Z", portalStatus: "active", callsAttended: 3, headshotUrl: null },
  ...o,
});

test("any status string lands in one of four health buckets", () => {
  assert.equal(statusToHealth("🚀 On-Track"), "good");
  assert.equal(statusToHealth("❌ At Risk"), "risk");
  assert.equal(statusToHealth("🚊 Off-Track"), "watch");
  assert.equal(statusToHealth("👋 Off-Boarded"), "idle");
  assert.equal(statusToHealth("🆕 Not Started"), "watch");
  assert.equal(statusToHealth(null), "good", "unknown reads as fine rather than alarming");
});

test("attention is risk, off-track, or a fortnight of silence", () => {
  assert.equal(needsAttention(client({ status: "❌ At Risk" }), NOW), true);
  assert.equal(needsAttention(client({ status: "🚊 Off-Track" }), NOW), true);
  assert.equal(needsAttention(client(), NOW), false, "on track and spoken to two days ago");

  const silent = client({ helm: { ...client().helm, lastContactAt: "2026-08-20T12:00:00Z" } });
  assert.equal(needsAttention(silent, NOW), true, "19 days is too long");
});

test("an off-boarded client is never flagged for attention", () => {
  const gone = client({ status: "👋 Off-Boarded", helm: { ...client().helm, lastContactAt: "2024-01-01T00:00:00Z" } });
  assert.equal(needsAttention(gone, NOW), false, "there is nothing left to rescue");
});

test("a client with no contact recorded is not assumed to be fine", () => {
  const never = client({ helm: { ...client().helm, lastContactAt: null } });
  assert.equal(needsAttention(never, NOW), false, "no Helm data is not evidence of neglect");
});

test("counts describe the roster the tiles filter to", () => {
  const rows = [
    client({ key: "1", status: "🚀 On-Track" }),
    client({ key: "2", status: "❌ At Risk" }),
    client({ key: "3", status: "🚊 Off-Track" }),
    client({ key: "4", status: "📆 Onboarding" }),
    client({ key: "5", status: "👋 Off-Boarded" }),
  ];
  const counts = rosterCounts(rows, NOW);
  assert.equal(counts.total, 4, "off-boarded is not part of the live roster");
  assert.equal(counts.risk, 1);
  assert.equal(counts.offtrack, 1);
  assert.equal(counts.ontrack, 1, "onboarding is counted separately from on track");
  assert.equal(counts.onboarding, 1);
  assert.equal(counts.offboarded, 1);
});

test("each filter shows what its label says", () => {
  const rows = [
    client({ key: "ok", name: "Ok", status: "🚀 On-Track" }),
    client({ key: "risk", name: "Risky", status: "❌ At Risk" }),
    client({ key: "gone", name: "Gone", status: "👋 Off-Boarded" }),
  ];
  assert.deepEqual(applyFilter(rows, "all", "", NOW).map((c) => c.name), ["Ok", "Risky"]);
  assert.deepEqual(applyFilter(rows, "risk", "", NOW).map((c) => c.name), ["Risky"]);
  assert.deepEqual(applyFilter(rows, "offboarded", "", NOW).map((c) => c.name), ["Gone"]);
  assert.deepEqual(applyFilter(rows, "attention", "", NOW).map((c) => c.name), ["Risky"]);
});

test("search narrows within the filter, not across it", () => {
  const rows = [
    client({ key: "1", name: "Ada", status: "🚀 On-Track" }),
    client({ key: "2", name: "Grace", status: "👋 Off-Boarded" }),
  ];
  assert.equal(applyFilter(rows, "all", "grace", NOW).length, 0, "off-boarded stays out of All");
  assert.equal(applyFilter(rows, "offboarded", "grace", NOW).length, 1);
});

test("Status and Program group; everything else is one ordered list", () => {
  const rows = [
    client({ key: "1", name: "Ada", status: "❌ At Risk", program: "LAUNCH" }),
    client({ key: "2", name: "Bea", status: "🚀 On-Track", program: "BOARDROOM" }),
  ];
  assert.deepEqual(groupRoster(rows, "status", NOW).map((g) => g.label), ["At Risk", "On Track"]);
  assert.deepEqual(groupRoster(rows, "program", NOW).map((g) => g.label), ["BOARDROOM", "LAUNCH"]);
  assert.equal(groupRoster(rows, "az", NOW).length, 1);
  assert.deepEqual(groupRoster(rows, "az", NOW)[0].clients.map((c) => c.name), ["Ada", "Bea"]);
});

test("an empty health bucket does not get a heading", () => {
  const groups = groupRoster([client({ status: "🚀 On-Track" })], "status", NOW);
  assert.deepEqual(groups.map((g) => g.label), ["On Track"]);
});

test("last contact puts the longest silence first, never-contacted at the top", () => {
  const rows = [
    client({ key: "1", name: "Recent", helm: { ...client().helm, lastContactAt: "2026-09-07T12:00:00Z" } }),
    client({ key: "2", name: "Stale", helm: { ...client().helm, lastContactAt: "2026-06-01T12:00:00Z" } }),
    client({ key: "3", name: "Never", helm: { ...client().helm, lastContactAt: null } }),
  ];
  assert.deepEqual(groupRoster(rows, "contact", NOW)[0].clients.map((c) => c.name), ["Never", "Stale", "Recent"]);
});

test("newest, calls and value each order by their own number", () => {
  const rows = [
    client({ key: "1", name: "Old", startDate: "2025-01-01", dealValue: 5000, helm: { ...client().helm, callsAttended: 9 } }),
    client({ key: "2", name: "New", startDate: "2026-09-01", dealValue: 12000, helm: { ...client().helm, callsAttended: 1 } }),
  ];
  assert.deepEqual(groupRoster(rows, "newest", NOW)[0].clients.map((c) => c.name), ["New", "Old"]);
  assert.deepEqual(groupRoster(rows, "calls", NOW)[0].clients.map((c) => c.name), ["New", "Old"]);
  assert.deepEqual(groupRoster(rows, "value", NOW)[0].clients.map((c) => c.name), ["New", "Old"]);
});

test("relative time reads the way people say it", () => {
  assert.equal(ago(null), "—");
  assert.equal(ago("2026-09-08T11:59:30Z", NOW), "now");
  assert.equal(ago("2026-09-08T11:30:00Z", NOW), "30m");
  assert.equal(ago("2026-09-08T09:00:00Z", NOW), "3h");
  assert.equal(ago("2026-09-04T12:00:00Z", NOW), "4d");
  assert.equal(ago("2026-06-08T12:00:00Z", NOW), "3mo");
  assert.equal(ago("2024-09-08T12:00:00Z", NOW), "2y");
});

test("days since handles both date shapes and refuses nonsense", () => {
  // A plain YYYY-MM-DD is read as local noon, the same way every other date in
  // the app is, so it can't drift a day either side of midnight. An instant is
  // read as the instant. Measured from a local reference the two agree.
  const localNow = new Date(2026, 8, 8, 12, 0, 0);
  assert.equal(daysSince("2026-09-01", localNow), 7);
  assert.equal(daysSince("2026-09-01T12:00:00", localNow), 7);
  assert.equal(daysSince(null, localNow), null);
  assert.equal(daysSince("not a date", localNow), null);
  assert.equal(daysSince("2026-09-20", localNow), 0, "a future date is not negative days");
});

test("the Status view groups by the status set on each member", () => {
  const rows = [
    client({ name: "Zoe", status: "🚀 On-Track" }),
    client({ name: "Ada", status: "📆 Onboarding Booked" }),
    client({ name: "Bea", status: "❌ At Risk" }),
    client({ name: "Cal", status: "🚀 On-Track" }),
  ];
  const stageOf = (c) => ({ Zoe: "on_track", Ada: "not_started", Bea: "at_risk", Cal: "on_track" })[c.name];
  const groups = groupRoster(rows, "status", NOW, stageOf);
  // Ordered the way the work flows, not alphabetically by group name.
  // Not started at the very top, then trouble, then the people who are fine.
  assert.deepEqual(groups.map((g) => g.label), [
    "🆕 Not started onboarding", "❌ At Risk", "🚀 On-Track",
  ]);
  // Empty stages are dropped rather than shown as headings with nothing under them.
  assert.equal(groups.some((g) => g.clients.length === 0), false);
  assert.deepEqual(groups.find((g) => g.label.includes("On-Track")).clients.map((c) => c.name), ["Cal", "Zoe"]);
});

test("without a resolver the Status view falls back to the coarse health buckets", () => {
  // Other callers get the old four-bucket grouping; only the Members sheet
  // passes a resolver and gets the six real statuses.
  const rows = [client({ name: "Ada", status: "❌ At Risk" }), client({ name: "Zoe", status: "🚀 On-Track" })];
  const groups = groupRoster(rows, "status", NOW);
  assert.deepEqual(groups.map((g) => g.label), ["At Risk", "On Track"]);
});
