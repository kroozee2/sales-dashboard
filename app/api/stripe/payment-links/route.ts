import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

// GET — your live Stripe payment links, with a friendly label + price, so an
// offer can be attached to the right one.
export async function GET() {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Stripe not configured", links: [] }, { status: 200 });
  try {
    const res = await stripe.paymentLinks.list({ active: true, limit: 100, expand: ["data.line_items"] });
    const links = await Promise.all(res.data.map(async (pl) => {
      // line_items may need a separate fetch if not expanded
      let label = "";
      let amount: number | null = null;
      let currency = "usd";
      try {
        const li = pl.line_items?.data ?? (await stripe.paymentLinks.listLineItems(pl.id, { limit: 1, expand: ["data.price.product"] })).data;
        const first = li?.[0];
        if (first) {
          const price = first.price;
          amount = price?.unit_amount != null ? price.unit_amount / 100 : null;
          currency = price?.currency ?? "usd";
          const product = price?.product;
          if (product && typeof product !== "string" && "name" in product) label = product.name ?? "";
        }
      } catch { /* best-effort label */ }
      return { id: pl.id, url: pl.url, label: label || "Payment link", amount, currency };
    }));
    return NextResponse.json({ links });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load payment links", links: [] }, { status: 200 });
  }
}
