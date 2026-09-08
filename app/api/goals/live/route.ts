import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { callsDb } from "@/lib/supabase-calls";
import { createClient } from "@supabase/supabase-js";
import { collectedManualPayments, netSucceededChargeCents } from "@/lib/revenue-metrics";
import { CLIENT_CALL_TYPES, PARTNER_CALL_TYPES } from "@/lib/call-lanes";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The numbers a goal can track by itself, a year at a time.
 *
 * Goals used to carry whatever number was typed into them, so "August Cash
 * Collected" said $46,000 while Stripe said $52,335 — the goal was only as
 * current as the last time someone remembered to update it. This returns cash
 * collected and sales calls booked, per month, so a goal can read its own
 * number from the same source the Finances page does.
 *
 * One year per request, one pass over Stripe, cached — the goals page needs
 * every month at once and shouldn't make twelve round trips to get them.
 */

const CACHE_TTL_MS = 3 * 60 * 1000;
const cache = new Map<string, { at: number; body: unknown }>();

/**
 * A finished month's cash never changes, so it's walked once and kept.
 * Only the month in progress is refetched, which turns a twenty-page crawl
 * through the year into a page or two.
 */
const closedMonths = new Map<string, Record<string, number>>();

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

async function sumChargesByMonth(stripe: Stripe, gte: number, lt: number): Promise<Record<string, number>> {
  const totals: Record<string, number> = {};
  const params: Stripe.ChargeListParams = { limit: 100, created: { gte, lt } };
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    if (startingAfter) params.starting_after = startingAfter;
    const page = await stripe.charges.list(params);
    for (const charge of page.data) {
      const cents = netSucceededChargeCents(charge);
      if (cents <= 0) continue;
      const key = monthKey(new Date(charge.created * 1000));
      totals[key] = (totals[key] ?? 0) + cents / 100;
    }
    hasMore = page.has_more;
    if (page.data.length > 0) startingAfter = page.data[page.data.length - 1].id;
    else break;
  }
  return totals;
}

async function cashByMonth(stripe: Stripe, year: number, now: Date): Promise<Record<string, number>> {
  const isCurrentYear = year === now.getFullYear();
  // Everything before the month in progress is settled history.
  const openFrom = isCurrentYear
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : new Date(year + 1, 0, 1);

  const closedKey = `${year}:${monthKey(openFrom)}`;
  let closed = closedMonths.get(closedKey);
  if (!closed) {
    closed = await sumChargesByMonth(
      stripe,
      Math.floor(new Date(year, 0, 1).getTime() / 1000),
      Math.floor(openFrom.getTime() / 1000),
    );
    closedMonths.set(closedKey, closed);
  }

  if (!isCurrentYear) return { ...closed };

  const open = await sumChargesByMonth(
    stripe,
    Math.floor(openFrom.getTime() / 1000),
    Math.floor(new Date(year + 1, 0, 1).getTime() / 1000),
  );
  return { ...closed, ...open };
}

/** Money collected outside Stripe still counts — same rule the Finances page uses. */
async function manualCashByMonth(year: number): Promise<Record<string, number>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL;
  const key = process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY;
  if (!url || !key) return {};
  try {
    const db = createClient(url, key);
    const { data } = await db
      .from("manual_payments")
      .select("amount,payment_type,status,payment_date")
      .gte("payment_date", `${year}-01-01`)
      .lte("payment_date", `${year}-12-31`);
    const totals: Record<string, number> = {};
    for (const p of collectedManualPayments(data ?? [], null)) {
      const k = String(p.payment_date).slice(0, 7);
      totals[k] = (totals[k] ?? 0) + Number(p.amount || 0);
    }
    return totals;
  } catch {
    return {};
  }
}

/** Sales-lane calls on the calendar, by the month they're booked into. */
async function callsByMonth(year: number): Promise<Record<string, number>> {
  const notSales = [...CLIENT_CALL_TYPES, ...PARTNER_CALL_TYPES];
  const counts: Record<string, number> = {};
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await callsDb
      .from("sales_calls")
      .select("call_date,call_type")
      .gte("call_date", `${year}-01-01`)
      .lt("call_date", `${year + 1}-01-01`)
      .range(from, from + pageSize - 1);
    if (error || !data?.length) break;
    for (const call of data) {
      // Client and partner calls live on their own calendars and are not pipeline.
      if (call.call_type && notSales.includes(call.call_type)) continue;
      if (!call.call_date) continue;
      const k = String(call.call_date).slice(0, 7);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    if (data.length < pageSize) break;
  }
  return counts;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  const refresh = searchParams.get("refresh") === "1";

  const cacheKey = String(year);
  const hit = cache.get(cacheKey);
  if (!refresh && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.body);
  }

  const now = new Date();
  const stripe = getStripe();
  const [stripeCash, manualCash, calls] = await Promise.all([
    stripe ? cashByMonth(stripe, year, now).catch(() => ({})) : Promise.resolve({}),
    manualCashByMonth(year),
    callsByMonth(year).catch(() => ({})),
  ]);

  const cash: Record<string, number> = {};
  for (const [k, v] of Object.entries(stripeCash)) cash[k] = Math.round(v);
  for (const [k, v] of Object.entries(manualCash)) cash[k] = Math.round((cash[k] ?? 0) + v);

  const body = {
    year,
    cashByMonth: cash,
    callsByMonth: calls,
    hasStripe: !!stripe,
    generatedAt: now.toISOString(),
  };
  cache.set(cacheKey, { at: Date.now(), body });
  return NextResponse.json(body);
}
