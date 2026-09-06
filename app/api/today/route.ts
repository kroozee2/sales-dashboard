import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);

// SOP follow-up cadence (hours until next touch, indexed by touches already made)
// 1st within 24h, 2nd within 48h, 3rd within 72h, 4th within a week, 5th = final CTA
const CADENCE_HOURS = [0, 24, 48, 72, 168, 168];

// Stages worked in SOP priority order: Hot first, then Warm, then Cold
const STAGE_PRIORITY: Record<string, number> = {
  "🔗 Pay Link Sent": 0,
  "🔥 Hot Prospect": 1,
  "📞 Call Booked": 2,
  "📣 Reached Out": 3,
  "👨 Prospect": 4,
};

export async function GET() {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const [leadsRes, callsRes, paymentsRes, outreachTodayRes] = await Promise.all([
    db
      .from("leads")
      .select("id, full_name, phone, email, prospect_stage, quality, source, notes, ghl_url, ghl_contact_id, last_update, ongoing_message_feed, social_url, instagram_url, facebook_url, linkedin_url, follow_up_date")
      .in("prospect_stage", Object.keys(STAGE_PRIORITY))
      .neq("prospect_stage", "🏦 Payment Received")
      .limit(500),
    db
      .from("sales_calls")
      .select("id, name, phone, email, ghl_url, ghl_contact_id, call_date, call_type, result, offer, deal_amount, objections, follow_up_status, follow_up_date, follow_up_count, follow_up_notes, ai_summary")
      .limit(500),
    db
      .from("manual_payments")
      .select("id, name, phone, email, ghl_url, ghl_contact_id, amount, payment_date, offer, source, notes, status")
      .eq("status", "scheduled"),
    db
      .from("outreaches")
      .select("lead_id, created_at")
      .gte("created_at", startOfToday),
  ]);

  // Leads with a manually-set follow-up date due today or overdue are always
  // included, even if they'd fall outside the 500-row hot-list window.
  const { data: scheduledLeads } = await db
    .from("leads")
    .select("id, full_name, phone, email, prospect_stage, quality, source, notes, ghl_url, ghl_contact_id, last_update, ongoing_message_feed, social_url, instagram_url, facebook_url, linkedin_url, follow_up_date")
    .not("follow_up_date", "is", null)
    .lte("follow_up_date", todayStr)
    .neq("prospect_stage", "🏦 Payment Received")
    .limit(100);

  const leadsById = new Map<string, NonNullable<typeof leadsRes.data>[number]>();
  for (const l of leadsRes.data ?? []) leadsById.set(l.id, l);
  for (const l of scheduledLeads ?? []) leadsById.set(l.id, l);
  const leads = [...leadsById.values()];
  const calls = callsRes.data ?? [];
  const promises = paymentsRes.data ?? [];
  const outreachesToday = outreachTodayRes.data ?? [];

  // Per-lead all-time outreach counts (touches) — one query, group client-side
  const { data: allOutreaches } = await db
    .from("outreaches")
    .select("lead_id")
    .in("lead_id", leads.map((l) => l.id));
  const touchCounts: Record<string, number> = {};
  for (const o of allOutreaches ?? []) {
    touchCounts[o.lead_id] = (touchCounts[o.lead_id] ?? 0) + 1;
  }

  // ── Follow-ups due (calls with Follow Up result, not closed/lost) ──
  const followupsDue = calls
    .filter((c) => {
      if (c.result !== "📣 Follow Up") return false;
      if (c.follow_up_status === "✅ Closed" || c.follow_up_status === "❌ Lost") return false;
      // due today, overdue, or orphaned (no date set)
      return !c.follow_up_date || c.follow_up_date <= todayStr;
    })
    .map((c) => ({
      ...c,
      overdueDays: c.follow_up_date
        ? Math.floor((now.getTime() - new Date(c.follow_up_date + "T12:00").getTime()) / 86400000)
        : null,
      orphaned: !c.follow_up_date,
    }))
    .sort((a, b) => (b.overdueDays ?? 999) - (a.overdueDays ?? 999));

  // ── Calls scheduled today ──
  const callsToday = calls
    .filter((c) => c.call_date?.startsWith(todayStr))
    .sort((a, b) => (a.call_date ?? "").localeCompare(b.call_date ?? ""));

  // ── Past calls never logged (ghosts) ──
  const unloggedCalls = calls
    .filter((c) => {
      if (!c.call_date || c.call_date >= todayStr) return false;
      return !c.result || c.result === "🔜 Upcoming";
    })
    .sort((a, b) => (b.call_date ?? "").localeCompare(a.call_date ?? ""))
    .slice(0, 10);

  // ── Hot-list re-engagement queue (SOP cadence) ──
  // A lead past "👨 Prospect" has been contacted before (stage predates outreach
  // logging), so zero logged touches still means re-engagement, not a first touch.
  const queue = leads
    .map((l) => {
      const touches = touchCounts[l.id] ?? 0;
      const stageImpliesContact = (STAGE_PRIORITY[l.prospect_stage ?? ""] ?? 9) <= 3 && l.prospect_stage !== "👨 Prospect";
      const hasHistory = !!(l.ongoing_message_feed || l.last_update);
      const reengage = touches > 0 || stageImpliesContact || hasHistory;
      const last = l.last_update ? new Date(l.last_update) : null;
      const hoursSince = last ? (now.getTime() - last.getTime()) / 3600000 : Infinity;
      const cadence = CADENCE_HOURS[Math.min(touches, CADENCE_HOURS.length - 1)];
      // Pay Link Sent + Hot Prospects are money on the table: always due after 24h quiet
      const highValue = l.prospect_stage === "🔗 Pay Link Sent" || l.prospect_stage === "🔥 Hot Prospect";
      // A manually-set follow-up date always wins, and pins the lead to the top
      const scheduledDue = !!(l.follow_up_date && l.follow_up_date <= todayStr);
      const due = scheduledDue || (highValue ? hoursSince >= 24 : hoursSince >= cadence);
      const finalCta = touches >= 4; // 5th touch = final CTA before removal
      return {
        ...l,
        touches,
        reengage,
        hoursSince: Math.round(hoursSince),
        due,
        scheduledDue,
        finalCta,
        priority: scheduledDue ? -1 : (STAGE_PRIORITY[l.prospect_stage ?? ""] ?? 9),
      };
    })
    .filter((l) => l.due && (l.scheduledDue || l.touches < 6))
    .sort((a, b) => a.priority - b.priority || (a.follow_up_date ?? "z").localeCompare(b.follow_up_date ?? "z") || b.hoursSince - a.hoursSince)
    .slice(0, 40);

  // ── Leads to message: hot prospects + anyone we've sent a message or link to ──
  // Not cadence-gated — these are active conversations that should always surface.
  const MESSAGE_STAGES = ["🔗 Pay Link Sent", "🔥 Hot Prospect", "📣 Reached Out"];
  const messageList = leads
    .filter((l) => MESSAGE_STAGES.includes(l.prospect_stage ?? ""))
    .map((l) => {
      const last = l.last_update ? new Date(l.last_update) : null;
      const hoursSince = last ? Math.round((now.getTime() - last.getTime()) / 3600000) : 999999;
      return {
        id: l.id,
        full_name: l.full_name,
        phone: l.phone,
        email: l.email,
        prospect_stage: l.prospect_stage,
        ghl_url: l.ghl_url,
        hoursSince,
        touches: touchCounts[l.id] ?? 0,
        priority: STAGE_PRIORITY[l.prospect_stage ?? ""] ?? 9,
      };
    })
    // Hottest stage first (Pay Link → Hot → Reached Out), longest-quiet first within a stage
    .sort((a, b) => a.priority - b.priority || b.hoursSince - a.hoursSince)
    .slice(0, 20);

  // ── Promised payments due within 3 days or overdue ──
  const cutoff = new Date(now.getTime() + 3 * 86400000).toISOString().split("T")[0];
  const promisesDue = promises
    .filter((p) => p.payment_date && p.payment_date <= cutoff)
    .sort((a, b) => (a.payment_date ?? "").localeCompare(b.payment_date ?? ""));

  // ── Scoreboard ──
  const bookedToday = calls.filter(
    (c) => c.call_date && c.call_date >= todayStr && c.result === "🔜 Upcoming"
  ).length;

  return NextResponse.json({
    followupsDue,
    callsToday,
    unloggedCalls,
    queue,
    messageList,
    promisesDue,
    allPromises: promises,
    scoreboard: {
      outreachesToday: outreachesToday.length,
      outreachTarget: 30, // SOP: 30+ hot-list re-engagements per day
      bookedUpcoming: bookedToday,
      bookTarget: 3, // SOP: book 3-5 calls today
      followupsOpen: followupsDue.length,
      queueSize: queue.length,
    },
  });
}
