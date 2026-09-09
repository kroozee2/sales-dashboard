import { NextResponse } from "next/server";
import {
  MASTERCLASS_PRICE_FALLBACK,
  MASTERCLASS_PRICE_ID,
  MASTERCLASS_PRODUCT_ID,
  MASTERCLASS_SEATS,
  isPurchase,
  seatCount,
  toBuyers,
  type StripeCharge,
} from "@/lib/masterclass";

// Everyone who bought the AI Employee Masterclass, read from Stripe.
//
// Stripe cannot filter charges by product, and walking recent checkout sessions
// misses anyone who bought before the window — the first version did exactly
// that and lost the earliest buyer, which would have shown a seat too many.
//
// So: narrow charges by this product's own price points, then confirm each
// candidate against its checkout session. Few lookups, and no charge for a
// different $97 product can slip through, of which this account has six.

const STRIPE = "https://api.stripe.com/v1";
const MAX_CHARGE_PAGES = 5;

async function stripe(path: string, key: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${STRIPE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`stripe ${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

/** What this product sells for, read from Stripe so a price change follows. */
async function productAmounts(key: string): Promise<Set<number>> {
  const amounts = new Set<number>();
  try {
    const price = await stripe(`/prices/${MASTERCLASS_PRICE_ID}`, key);
    if (typeof price.unit_amount === "number") amounts.add(price.unit_amount);
  } catch {
    // Falling back keeps the page working if that price is ever archived.
  }
  if (amounts.size === 0) amounts.add(MASTERCLASS_PRICE_FALLBACK);
  return amounts;
}

async function boughtThisProduct(paymentIntent: string, key: string): Promise<boolean> {
  const sessions = await stripe(`/checkout/sessions?payment_intent=${paymentIntent}&limit=1&expand[]=data.line_items`, key);
  const session = ((sessions.data ?? []) as Array<Record<string, unknown>>)[0];
  if (!session) return false;
  const lines = (session.line_items as { data?: Array<{ price?: { product?: string } }> } | undefined)?.data ?? [];
  return lines.some((line) => line.price?.product === MASTERCLASS_PRODUCT_ID);
}

export async function GET() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });

  try {
    const amounts = await productAmounts(key);

    // Walk charges back far enough to cover the whole run of the offer.
    const candidates: StripeCharge[] = [];
    let startingAfter: string | undefined;
    for (let page = 0; page < MAX_CHARGE_PAGES; page += 1) {
      const query = `/charges?limit=100${startingAfter ? `&starting_after=${startingAfter}` : ""}`;
      const batch = await stripe(query, key);
      const rows = (batch.data ?? []) as StripeCharge[];
      if (rows.length === 0) break;
      for (const charge of rows) {
        if (isPurchase(charge) && amounts.has(charge.amount) && typeof charge.payment_intent === "string") {
          candidates.push(charge);
        }
      }
      if (batch.has_more !== true) break;
      startingAfter = rows[rows.length - 1]?.id;
      if (!startingAfter) break;
    }

    const confirmed: StripeCharge[] = [];
    for (const charge of candidates) {
      if (await boughtThisProduct(charge.payment_intent as string, key)) confirmed.push(charge);
    }

    const buyers = toBuyers(confirmed);
    return NextResponse.json({
      buyers,
      seats: seatCount(buyers.length, MASTERCLASS_SEATS),
      product_id: MASTERCLASS_PRODUCT_ID,
      generated_at: new Date().toISOString(),
    }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (caught) {
    console.error("[masterclass] Stripe read failed", { message: caught instanceof Error ? caught.message.slice(0, 80) : "unknown" });
    return NextResponse.json({ error: "Stripe could not be reached. Try again in a moment." }, { status: 502 });
  }
}
