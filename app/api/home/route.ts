import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);

const recId = (s: string | null | undefined) => (s?.match(/rec[A-Za-z0-9]{14,}/)?.[0] ?? null);

type Ranges = {
  curStart: Date; curEnd: Date; prevStart: Date; prevEnd: Date;
  buckets: number; label: string; prevLabel: string;
  bucketOf: (dt: Date, start: Date) => number;
  bucketLabels: string[];
};

function ranges(period: string): Ranges {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (period === "today") {
    const curStart = new Date(y, m, d);
    const prevStart = new Date(y, m, d - 1);
    return {
      curStart, curEnd: now, prevStart, prevEnd: new Date(y, m, d - 1, now.getHours(), now.getMinutes()),
      buckets: 24, label: "Today", prevLabel: "Yesterday",
      bucketOf: (dt, start) => Math.min(23, Math.max(0, Math.floor((dt.getTime() - start.getTime()) / 3600000))),
      bucketLabels: Array.from({ length: 24 }, (_, i) => (i % 6 === 0 ? `${i}:00` : "")),
    };
  }
  if (period === "week") {
    const dow = now.getDay();
    const curStart = new Date(y, m, d - dow);
    const prevStart = new Date(y, m, d - dow - 7);
    return {
      curStart, curEnd: now, prevStart, prevEnd: new Date(prevStart.getTime() + (now.getTime() - curStart.getTime())),
      buckets: 7, label: "This week", prevLabel: "Last week",
      bucketOf: (dt, start) => Math.min(6, Math.max(0, Math.floor((new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime() - start.getTime()) / 86400000))),
      bucketLabels: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    };
  }
  if (period === "year") {
    const curStart = new Date(y, 0, 1);
    const prevStart = new Date(y - 1, 0, 1);
    return {
      curStart, curEnd: now, prevStart, prevEnd: new Date(y - 1, m, d, 23, 59),
      buckets: 12, label: "This year", prevLabel: "Last year",
      bucketOf: (dt) => dt.getMonth(),
      bucketLabels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    };
  }
  // month
  const curStart = new Date(y, m, 1);
  const prevStart = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  return {
    curStart, curEnd: now, prevStart, prevEnd: new Date(y, m - 1, d, 23, 59),
    buckets: daysInMonth, label: "This month", prevLabel: "Last month",
    bucketOf: (dt) => Math.min(daysInMonth - 1, dt.getDate() - 1),
    bucketLabels: Array.from({ length: daysInMonth }, (_, i) => ((i + 1) % 5 === 0 || i === 0 ? `${i + 1}` : "")),
  };
}

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get("period") || "month";
  const r = ranges(period);
  const client = db();
  const sinceIso = r.prevStart.toISOString();
  const todayStr = new Date().toISOString().split("T")[0];

  const todayStartIso = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).toISOString();
  const nowIso = new Date().toISOString();

  const [salesRes, paymentsRes, leadsCountRes, offersRes, recurringRes, upcomingRes, recentCallsRes] = await Promise.all([
    client.from("sales_calls").select("name, call_date, result, deal_amount, new_revenue, cc_upfront, offer").gte("call_date", sinceIso),
    client.from("manual_payments").select("name, amount, payment_date, offer, status").eq("status", "collected").gte("payment_date", r.prevStart.toISOString().split("T")[0]),
    client.from("leads").select("id", { count: "exact", head: true }).gte("opt_in_date", r.curStart.toISOString()),
    client.from("offers").select("id, airtable_id, name"),
    client.from("manual_payments").select("name, amount, interval_type, next_bill_date").eq("payment_type", "recurring").eq("status", "active"),
    client.from("sales_calls").select("id, name, call_date, call_type").gte("call_date", todayStartIso).order("call_date", { ascending: true }).limit(8),
    client.from("sales_calls").select("id, name, call_date, result, deal_amount, new_revenue, cc_upfront").lt("call_date", nowIso).not("result", "is", null).neq("result", "🔜 Upcoming").order("call_date", { ascending: false }).limit(6),
  ]);

  const offers = offersRes.data ?? [];
  const offerName = (raw: string | null) => {
    if (!raw) return null;
    const rid = recId(raw);
    if (rid) return offers.find((o) => o.airtable_id === rid || o.id === rid)?.name ?? null;
    return raw.replace(/[[\]"]/g, "").trim() || null;
  };

  // Revenue events: closed sales + collected payments.
  //
  // A sale's value can live in any of three columns depending on how it was
  // logged: deal_amount (older rows), new_revenue (what the call panel writes
  // now), or cc_upfront when only the cash collected was entered. Reading just
  // deal_amount silently dropped real sales from the month, so fall through the
  // three in the same order the Calls page does.
  const saleAmount = (s: { deal_amount?: unknown; new_revenue?: unknown; cc_upfront?: unknown }) =>
    Number(s.deal_amount ?? 0) || Number(s.new_revenue ?? 0) || Number(s.cc_upfront ?? 0);

  type Ev = { name: string; amount: number; date: Date; kind: "Sale" | "Payment"; offer: string | null };
  const events: Ev[] = [];
  for (const s of salesRes.data ?? []) {
    const amount = saleAmount(s);
    if (s.result === "✅ Sale" && amount > 0 && s.call_date) {
      events.push({ name: s.name, amount, date: new Date(s.call_date), kind: "Sale", offer: offerName(s.offer) });
    }
  }
  for (const p of paymentsRes.data ?? []) {
    if (p.amount && p.payment_date) {
      events.push({ name: p.name, amount: Number(p.amount), date: new Date(p.payment_date + "T12:00"), kind: "Payment", offer: offerName(p.offer) });
    }
  }

  // Bucketed cumulative series (this period vs last period)
  const curB = new Array(r.buckets).fill(0);
  const prevB = new Array(r.buckets).fill(0);
  let revCur = 0, revPrev = 0, salesCur = 0;
  for (const e of events) {
    if (e.date >= r.curStart && e.date <= r.curEnd) {
      curB[r.bucketOf(e.date, r.curStart)] += e.amount;
      revCur += e.amount;
      if (e.kind === "Sale") salesCur += 1;
    } else if (e.date >= r.prevStart && e.date <= r.prevEnd) {
      prevB[r.bucketOf(e.date, r.prevStart)] += e.amount;
      revPrev += e.amount;
    }
  }
  const curBucketIdx = r.bucketOf(new Date(), r.curStart);
  let cc = 0, pc = 0;
  const series = r.bucketLabels.map((label, i) => {
    cc += curB[i]; pc += prevB[i];
    return { label, cur: i <= curBucketIdx ? Math.round(cc) : null, prev: Math.round(pc) };
  });

  // Calls booked + close rate this period
  const callsThis = (salesRes.data ?? []).filter((s) => s.call_date && new Date(s.call_date) >= r.curStart && new Date(s.call_date) <= r.curEnd);
  const decided = callsThis.filter((s) => s.result && s.result !== "🔜 Upcoming");
  const closeRate = decided.length ? Math.round((salesCur / decided.length) * 100) : 0;

  // Recent activity
  const recent = [...events].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 8).map((e) => ({
    name: e.name, amount: e.amount, kind: e.kind, offer: e.offer, date: e.date.toISOString().split("T")[0],
  }));

  const changePct = revPrev > 0 ? Math.round(((revCur - revPrev) / revPrev) * 100) : (revCur > 0 ? 100 : 0);

  // Recurring / subscriptions — who's billing next
  const recurring = (recurringRes.data ?? [])
    .map((p) => ({ name: p.name, amount: Number(p.amount), interval: p.interval_type ?? "month", next_bill_date: p.next_bill_date }))
    .sort((a, b) => (a.next_bill_date ?? "z").localeCompare(b.next_bill_date ?? "z"));
  const mrr = recurring
    .filter((p) => (p.interval ?? "").toLowerCase().startsWith("month"))
    .reduce((s, p) => s + p.amount, 0);

  const upcomingCalls = (upcomingRes.data ?? [])
    .filter((c) => !c.call_date || true)
    .map((c) => ({ id: c.id, name: c.name, call_date: c.call_date, call_type: c.call_type }));
  const recentCalls = (recentCallsRes.data ?? [])
    .map((c) => ({ id: c.id, name: c.name, call_date: (c.call_date ?? "").split("T")[0], result: c.result, deal_amount: saleAmount(c) || null }));

  return NextResponse.json({
    period,
    label: r.label,
    prevLabel: r.prevLabel,
    revenue: Math.round(revCur),
    revenuePrev: Math.round(revPrev),
    changePct,
    salesCount: salesCur,
    callsBooked: callsThis.length,
    closeRate,
    newLeads: leadsCountRes.count ?? 0,
    series,
    recent,
    recurring,
    mrr: Math.round(mrr),
    upcomingCalls,
    recentCalls,
    todayStr,
  });
}
