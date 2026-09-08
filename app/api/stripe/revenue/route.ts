import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { DEMO_REVENUE_DATA, DEMO_TRANSACTIONS } from "@/lib/mock-data";
import { netSucceededChargeCents } from "@/lib/revenue-metrics";
import { bucketIndex, periodWindow, previousWindow } from "@/lib/revenue-periods";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Walking every charge and invoice takes tens of seconds over a long period, so
 * a warm instance answers repeat loads from memory. Stripe charges are
 * immutable once settled; three minutes of staleness costs nothing and keeps
 * tab-switching instant. `?refresh=1` skips it.
 */
const CACHE_TTL_MS = 3 * 60 * 1000;
const responseCache = new Map<string, { at: number; body: unknown }>();

function categorizeByAmount(cents: number): string {
  if (cents >= 1400000) return "BOARDROOM";
  if (cents >= 800000) return "LAUNCH PIF";
  if (cents >= 150000) return "BOARDROOM Monthly";
  if (cents >= 80000) return "LAUNCH Monthly";
  return "Other";
}

async function fetchAllCharges(stripe: Stripe, gte: number | null): Promise<Stripe.Charge[]> {
  const all: Stripe.Charge[] = [];
  const params: Stripe.ChargeListParams = {
    limit: 100,
    expand: ["data.customer"],
  };
  if (gte !== null) params.created = { gte };

  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    if (startingAfter) params.starting_after = startingAfter;
    const page = await stripe.charges.list(params);
    all.push(...page.data);
    hasMore = page.has_more;
    if (page.data.length > 0) startingAfter = page.data[page.data.length - 1].id;
    else break;
  }

  return all;
}

/**
 * Payment-intent ids belonging to subscription invoices.
 *
 * Stripe's current API dropped `charge.invoice`, so the old `!!charge.invoice`
 * test silently marked every renewal as a brand-new sale. The link now runs
 * invoice → payments → payment_intent, and a charge carries its payment_intent,
 * so one pass over invoices gives us the set to test against.
 */
async function fetchSubscriptionPaymentIntents(stripe: Stripe, gte: number | null): Promise<Set<string>> {
  const ids = new Set<string>();
  const params: Stripe.InvoiceListParams = { limit: 100, expand: ["data.payments"] };
  if (gte !== null) params.created = { gte };

  let hasMore = true;
  let startingAfter: string | undefined;
  while (hasMore) {
    if (startingAfter) params.starting_after = startingAfter;
    const page = await stripe.invoices.list(params);
    for (const invoice of page.data) {
      if (!invoice.billing_reason?.startsWith("subscription")) continue;
      const payments = (invoice as unknown as {
        payments?: { data?: { payment?: { payment_intent?: string | null } }[] };
      }).payments?.data ?? [];
      for (const payment of payments) {
        const pi = payment.payment?.payment_intent;
        if (pi) ids.add(pi);
      }
    }
    hasMore = page.has_more;
    if (page.data.length > 0) startingAfter = page.data[page.data.length - 1].id;
    else break;
  }
  return ids;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "mtd";
  const refresh = searchParams.get("refresh") === "1";

  const cached = responseCache.get(period);
  if (!refresh && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.body);
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({
      chart: DEMO_REVENUE_DATA["monthly"],
      transactions: DEMO_TRANSACTIONS,
      summary: { total: 45000, newSalesLowTicket: 2000, newSalesHighTicket: 28000, newSalesLowCount: 4, newSalesHighCount: 3 },
      isDemo: true,
    });
  }

  try {
    const now = new Date();
    const win = periodWindow(period, now);
    const prev = previousWindow(period, now);

    // One pass over Stripe covers both windows — the comparison period is
    // simply the earlier slice of the same charge list.
    const fetchFrom = win.gte === null ? null : Math.min(win.gte, prev?.gte ?? win.gte);
    const [allCharges, subscriptionPaymentIntents] = await Promise.all([
      fetchAllCharges(stripe, fetchFrom),
      fetchSubscriptionPaymentIntents(stripe, fetchFrom),
    ]);
    const succeeded = allCharges.filter((charge) => netSucceededChargeCents(charge) > 0);

    // A customer with twelve renewals used to cost twelve identical lookups.
    // One promise per customer, shared by every charge that needs it.
    const customerCache = new Map<string, Promise<{ name: string | null; email: string | null }>>();
    const lookupCustomer = (id: string) => {
      const hit = customerCache.get(id);
      if (hit) return hit;
      const pending = stripe.customers.retrieve(id)
        .then((cust) => (cust && !("deleted" in cust)
          ? { name: cust.name ?? null, email: cust.email ?? null }
          : { name: null, email: null }))
        .catch(() => ({ name: null, email: null }));
      customerCache.set(id, pending);
      return pending;
    };

    const inWindow = (ts: number, w: { gte: number | null; lt: number }) =>
      (w.gte === null || ts >= w.gte) && ts < w.lt;

    const isRecurring = (c: Stripe.Charge) => {
      const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id ?? null;
      return !!pi && subscriptionPaymentIntents.has(pi);
    };

    const current = await Promise.all(
      succeeded.filter((c) => inWindow(c.created, win)).map(async (c) => {
        const netAmountCents = netSucceededChargeCents(c);
        const customer = c.customer as Stripe.Customer | null;
        let name =
          c.billing_details?.name ||
          (customer && typeof customer === "object" ? customer.name : null) ||
          null;
        let email =
          c.billing_details?.email ||
          (customer && typeof customer === "object" ? customer.email : null) ||
          null;

        if (!name && c.customer && typeof c.customer === "string") {
          const cust = await lookupCustomer(c.customer);
          name = cust.name;
          email = cust.email;
        }

        const isSubscriptionCharge = isRecurring(c);

        // What Stripe was told the charge was for beats a price bracket —
        // "Skool with Andrew" is a product, "Other" is not. Renewals only ever
        // say "Subscription update", so those keep the bracket.
        const description = c.description?.trim();
        const offer = !isSubscriptionCharge && description
          ? description
          : categorizeByAmount(netAmountCents);

        return {
          id: c.id,
          name: name || "Customer",
          email: email || null,
          phone: null as string | null,
          offer,
          amount: netAmountCents / 100,
          date: new Date(c.created * 1000).toISOString().split("T")[0],
          status: c.status,
          customerId: typeof c.customer === "string" ? c.customer : (c.customer as { id?: string })?.id ?? null,
          createdTs: c.created,
          isSubscriptionCharge,
          receiptUrl: c.receipt_url ?? null,
        };
      })
    );

    // The comparison period is only ever summed, so amounts and timing are all
    // it needs — no names, no customer lookups.
    const previousTx = prev
      ? succeeded.filter((c) => inWindow(c.created, prev)).map((c) => ({
          amount: netSucceededChargeCents(c) / 100,
          createdTs: c.created,
          isSubscriptionCharge: isRecurring(c),
        }))
      : [];

    // Bucket by index so a charge can never land in a bar it doesn't belong to.
    const zeros = () => win.labels.map(() => 0);
    const revenue = zeros();
    const high = zeros();
    const low = zeros();
    const recurring = zeros();
    for (const t of current) {
      const i = bucketIndex(win.edges, t.createdTs);
      if (i < 0) continue;
      revenue[i] += t.amount;
      if (t.isSubscriptionCharge) recurring[i] += t.amount;
      else if (t.amount >= 1000) high[i] += t.amount;
      else low[i] += t.amount;
    }

    const prevRevenue = prev ? prev.labels.map(() => 0) : [];
    if (prev) {
      for (const t of previousTx) {
        const i = bucketIndex(prev.edges, t.createdTs);
        if (i >= 0) prevRevenue[i] += t.amount;
      }
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const chart = win.labels.map((label, i) => ({
      label,
      revenue: Math.round(revenue[i]),
      high: Math.round(high[i]),
      low: Math.round(low[i]),
      recurring: Math.round(recurring[i]),
      // Aligned by index, so bar N of this period sits against bar N of last.
      prev: prev && i < prevRevenue.length ? Math.round(prevRevenue[i]) : null,
      start: win.edges[i],
      end: win.edges[i + 1],
    }));

    const sum = (rows: { amount: number }[]) => round(rows.reduce((s, t) => s + t.amount, 0));
    const oneOff = current.filter((t) => !t.isSubscriptionCharge);
    const lowTx = oneOff.filter((t) => t.amount < 1000);
    const highTx = oneOff.filter((t) => t.amount >= 1000);
    const recurringTx = current.filter((t) => t.isSubscriptionCharge);

    // Legacy fields are always the current calendar month, whatever period is
    // selected. Kept because other pages still read this shape.
    const monthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
    const thisMonth = succeeded
      .filter((c) => c.created >= monthStart && !isRecurring(c))
      .map((c) => netSucceededChargeCents(c) / 100);
    const monthLow = thisMonth.filter((a) => a < 1000);
    const monthHigh = thisMonth.filter((a) => a >= 1000);

    const sortedTx = [...current].sort((a, b) => b.createdTs - a.createdTs);

    const body = {
      chart,
      period,
      window: { gte: win.gte, lt: win.lt, labels: win.labels, edges: win.edges },
      transactions: sortedTx,
      summary: {
        total: sum(current),
        newSalesLowTicket: round(monthLow.reduce((a, b) => a + b, 0)),
        newSalesHighTicket: round(monthHigh.reduce((a, b) => a + b, 0)),
        newSalesLowCount: monthLow.length,
        newSalesHighCount: monthHigh.length,
        // Period-scoped — these follow the selector, unlike the legacy fields.
        lowTicket: sum(lowTx),
        lowCount: lowTx.length,
        highTicket: sum(highTx),
        highCount: highTx.length,
        recurringTotal: sum(recurringTx),
        recurringCount: recurringTx.length,
        customers: new Set(current.map((t) => t.customerId ?? t.email ?? t.id)).size,
      },
      previous: prev
        ? {
            label: prev.key,
            gte: prev.gte,
            lt: prev.lt,
            labels: prev.labels,
            edges: prev.edges,
            total: sum(previousTx),
            lowTicket: sum(previousTx.filter((t) => !t.isSubscriptionCharge && t.amount < 1000)),
            highTicket: sum(previousTx.filter((t) => !t.isSubscriptionCharge && t.amount >= 1000)),
            recurringTotal: sum(previousTx.filter((t) => t.isSubscriptionCharge)),
            count: previousTx.length,
          }
        : null,
      isDemo: false,
    };

    responseCache.set(period, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (err) {
    console.error("Stripe revenue error:", err);
    return NextResponse.json({
      chart: [],
      transactions: [],
      summary: { total: 0, newSalesLowTicket: 0, newSalesHighTicket: 0, newSalesLowCount: 0, newSalesHighCount: 0 },
      previous: null,
      isDemo: false,
      error: String(err),
    });
  }
}
