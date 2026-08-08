import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { DEMO_REVENUE_DATA, DEMO_TRANSACTIONS } from "@/lib/mock-data";

function categorizeByAmount(cents: number): string {
  if (cents >= 1400000) return "BOARDROOM";
  if (cents >= 800000) return "LAUNCH PIF";
  if (cents >= 150000) return "BOARDROOM Monthly";
  if (cents >= 80000) return "LAUNCH Monthly";
  return "Other";
}

interface PeriodRange {
  gte: number | null; // null = all time
  lte: number;
  buckets: string[];
  getBucket: (ts: number) => string;
}

function getPeriodRange(period: string): PeriodRange {
  const now = new Date();
  const lte = Math.floor(now.getTime() / 1000);
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dow = now.getDay(); // 0=Sun

  if (period === "wtd") {
    // Monday-based week
    const daysSinceMon = (dow === 0 ? 6 : dow - 1);
    const monday = new Date(y, m, d - daysSinceMon);
    const buckets: string[] = [];
    for (let i = 0; i <= daysSinceMon; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      buckets.push(day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }));
    }
    const gte = Math.floor(monday.getTime() / 1000);
    return {
      gte, lte, buckets,
      getBucket: (ts) => {
        const d2 = new Date(ts * 1000);
        return d2.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      },
    };
  }

  if (period === "mtd") {
    const monthStart = new Date(y, m, 1);
    const buckets: string[] = [];
    for (let i = 1; i <= d; i++) {
      buckets.push(`${monthStart.toLocaleDateString("en-US", { month: "short" })} ${i}`);
    }
    return {
      gte: Math.floor(monthStart.getTime() / 1000),
      lte, buckets,
      getBucket: (ts) => {
        const d2 = new Date(ts * 1000);
        return `${d2.toLocaleDateString("en-US", { month: "short" })} ${d2.getDate()}`;
      },
    };
  }

  if (period === "qtd") {
    const qStartMonth = Math.floor(m / 3) * 3;
    const qStart = new Date(y, qStartMonth, 1);
    const buckets: string[] = [];
    for (let mo = qStartMonth; mo <= m; mo++) {
      buckets.push(new Date(y, mo, 1).toLocaleDateString("en-US", { month: "short" }));
    }
    return {
      gte: Math.floor(qStart.getTime() / 1000),
      lte, buckets,
      getBucket: (ts) => new Date(ts * 1000).toLocaleDateString("en-US", { month: "short" }),
    };
  }

  if (period === "ytd") {
    const yearStart = new Date(y, 0, 1);
    const buckets: string[] = [];
    for (let mo = 0; mo <= m; mo++) {
      buckets.push(new Date(y, mo, 1).toLocaleDateString("en-US", { month: "short" }));
    }
    return {
      gte: Math.floor(yearStart.getTime() / 1000),
      lte, buckets,
      getBucket: (ts) => new Date(ts * 1000).toLocaleDateString("en-US", { month: "short" }),
    };
  }

  // alltime — bucket by year
  const buckets: string[] = [];
  for (let yr = 2020; yr <= y; yr++) {
    buckets.push(String(yr));
  }
  return {
    gte: null,
    lte, buckets,
    getBucket: (ts) => String(new Date(ts * 1000).getFullYear()),
  };
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "mtd";

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
    const range = getPeriodRange(period);

    const allCharges = await fetchAllCharges(stripe, range.gte);
    const succeeded = allCharges.filter((c) => c.status === "succeeded");

    const bucketMap: Record<string, number> = {};
    range.buckets.forEach((b) => (bucketMap[b] = 0));

    const enriched = await Promise.all(
      succeeded.map(async (c) => {
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
          try {
            const cust = await stripe.customers.retrieve(c.customer);
            if (cust && !("deleted" in cust)) {
              name = cust.name || null;
              email = cust.email || null;
            }
          } catch {}
        }

        const bucket = range.getBucket(c.created);
        if (bucket in bucketMap) bucketMap[bucket] += c.amount / 100;

        // Subscription charges have an invoice attached; one-time purchases don't
        const isSubscriptionCharge = !!(c as unknown as { invoice?: string | null }).invoice;

        return {
          id: c.id,
          name: name || "Customer",
          email: email || null,
          phone: null as string | null,
          offer: categorizeByAmount(c.amount),
          amount: c.amount / 100,
          date: new Date(c.created * 1000).toISOString().split("T")[0],
          status: c.status,
          customerId: typeof c.customer === "string" ? c.customer : (c.customer as { id?: string })?.id ?? null,
          createdTs: c.created,
          isSubscriptionCharge,
        };
      })
    );

    const chart = range.buckets.map((label) => ({ label, revenue: Math.round(bucketMap[label]) }));
    const total = enriched.reduce((s, t) => s + t.amount, 0);

    // New sales this calendar month for the KPI cards (always current month regardless of selected period)
    const now = new Date();
    const monthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
    // For mtd/alltime we may already have this month's data; for others re-use enriched if it covers it
    const thisMonthCharges = period === "mtd" || period === "alltime" || period === "ytd" || period === "qtd"
      ? enriched.filter((t) => t.createdTs >= monthStart)
      : enriched.filter((t) => t.createdTs >= monthStart); // always filter

    const lowTicket = thisMonthCharges.filter((t) => t.amount < 1000 && !t.isSubscriptionCharge);
    const highTicket = thisMonthCharges.filter((t) => t.amount >= 1000 && !t.isSubscriptionCharge);

    // Sort transactions newest first
    const sortedTx = [...enriched].sort((a, b) => b.createdTs - a.createdTs);

    return NextResponse.json({
      chart,
      transactions: sortedTx.slice(0, 25),
      summary: {
        total,
        newSalesLowTicket: lowTicket.reduce((s, t) => s + t.amount, 0),
        newSalesHighTicket: highTicket.reduce((s, t) => s + t.amount, 0),
        newSalesLowCount: lowTicket.length,
        newSalesHighCount: highTicket.length,
      },
      isDemo: false,
    });
  } catch (err) {
    console.error("Stripe revenue error:", err);
    return NextResponse.json({
      chart: [],
      transactions: [],
      summary: { total: 0, newSalesLowTicket: 0, newSalesHighTicket: 0, newSalesLowCount: 0, newSalesHighCount: 0 },
      isDemo: false,
      error: String(err),
    });
  }
}
