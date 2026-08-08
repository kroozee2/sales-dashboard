import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

const PRODUCT_CATEGORY: Record<string, string> = {
  prod_THiqJJWf5fAFLn: "BOARDROOM",
  prod_SUcGUmlKVAt0SW: "LAUNCH",
  prod_TKHEckSOuH5s: "LAUNCH",
  prod_UW2ll9z9DcUhuE: "AI Mastermind",
  prod_TzqtjPwO1SsVfV: "30-Day Accelerator",
  prod_UZ1e89xqXnhjcp: "Consulting",
};

export async function GET() {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ subscriptions: [], mrr: 0, totalActive: 0, isDemo: true });
  }

  try {
    const subs = await stripe.subscriptions.list({
      limit: 100,
      status: "active",
      expand: ["data.customer", "data.items"],
    });

    const enriched = subs.data.map((sub) => {
      const customer = sub.customer as import("stripe").Stripe.Customer;
      const item = sub.items.data[0];
      const price = item?.price;
      const productId = typeof price?.product === "string" ? price.product : (price?.product as { id: string })?.id ?? "";
      const amountCents = price?.unit_amount ?? 0;
      const interval = price?.recurring?.interval ?? "month";
      const monthlyAmount = interval === "year" ? amountCents / 12 : amountCents;
      const isPaused = !!(sub as unknown as { pause_collection?: { behavior: string } }).pause_collection;
      const periodEnd = (item as unknown as { current_period_end?: number }).current_period_end;
      const nextBillTs = periodEnd ?? null;
      const nextBill = periodEnd
        ? new Date(periodEnd * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "—";

      const offer =
        PRODUCT_CATEGORY[productId] ||
        (amountCents >= 150000 ? "BOARDROOM" : amountCents >= 80000 ? "LAUNCH" : "Other");

      return {
        id: sub.id,
        itemId: item?.id ?? null,
        priceId: price?.id ?? null,
        currency: price?.currency ?? "usd",
        name: customer?.name || "Customer",
        email: customer?.email || null,
        offer,
        amount: amountCents / 100,
        monthlyAmount: monthlyAmount / 100,
        interval,
        status: isPaused ? "paused" : "active",
        nextBill,
        nextBillTs,
        startDate: new Date(sub.start_date * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        customerId: customer?.id ?? null,
      };
    });

    // Sort by next billing date ascending (nulls last)
    enriched.sort((a, b) => {
      if (!a.nextBillTs && !b.nextBillTs) return 0;
      if (!a.nextBillTs) return 1;
      if (!b.nextBillTs) return -1;
      return a.nextBillTs - b.nextBillTs;
    });

    const activeOnly = enriched.filter((s) => s.status === "active");
    const mrr = Math.round(activeOnly.reduce((s, sub) => s + sub.monthlyAmount, 0));

    return NextResponse.json({
      subscriptions: enriched,
      mrr,
      totalActive: activeOnly.length,
      totalPaused: enriched.filter((s) => s.status === "paused").length,
      isDemo: false,
    });
  } catch (err) {
    console.error("Stripe subscriptions error:", err);
    return NextResponse.json({ subscriptions: [], mrr: 0, totalActive: 0, isDemo: true });
  }
}

// Pause, resume, edit amount, edit billing date
export async function PATCH(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "No Stripe key" }, { status: 500 });

  const body = await req.json();
  const { subscriptionId, action } = body;

  try {
    if (action === "pause") {
      await (stripe.subscriptions.update as Function)(subscriptionId, {
        pause_collection: { behavior: "keep_as_draft" },
      });

    } else if (action === "resume") {
      await (stripe.subscriptions.update as Function)(subscriptionId, {
        pause_collection: "",
      });

    } else if (action === "editAmount") {
      // Create a new inline price on the existing subscription item
      const { itemId, amountCents, currency, interval } = body;
      await (stripe.subscriptions.update as Function)(subscriptionId, {
        proration_behavior: "none",
        items: [{
          id: itemId,
          price_data: {
            currency: currency ?? "usd",
            unit_amount: Math.round(amountCents),
            recurring: { interval: interval ?? "month" },
          },
        }],
      });

    } else if (action === "editBillingDate") {
      // Shift next billing date by setting trial_end
      const { billingDateTs } = body;
      await (stripe.subscriptions.update as Function)(subscriptionId, {
        trial_end: billingDateTs,
        proration_behavior: "none",
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Cancel / delete a subscription
export async function DELETE(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "No Stripe key" }, { status: 500 });

  const { subscriptionId } = await req.json();
  try {
    await stripe.subscriptions.cancel(subscriptionId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
