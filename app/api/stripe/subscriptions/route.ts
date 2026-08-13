import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { mergeStripeBillingRows } from "@/lib/stripe-subscriptions";

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

    const schedules = await stripe.subscriptionSchedules.list({
      limit: 100,
      scheduled: true,
      expand: ["data.customer"],
    });

    const pricesById = Object.fromEntries(await Promise.all(
      [...new Set(schedules.data.flatMap((schedule) =>
        schedule.phases.flatMap((phase) => phase.items.map((item) =>
          typeof item.price === "string" ? item.price : item.price.id,
        )),
      ))].map(async (priceId) => [priceId, await stripe.prices.retrieve(priceId)]),
    ));

    const enriched = mergeStripeBillingRows({
      subscriptions: subs.data,
      schedules: schedules.data,
      pricesById,
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
