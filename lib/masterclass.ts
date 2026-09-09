// Who bought the AI Employee Masterclass.
//
// Matching on the $97 price alone would be wrong: six different $97 masterclass
// products exist in this Stripe account, and a recurring $97 subscription
// renews against the same amount. The product id is the only safe key.

export const MASTERCLASS_PRODUCT_ID = "prod_V8K5dDj8B1LvHQ";
// Stripe's /prices?product= filter returns nothing for this product even though
// the price plainly belongs to it, so the price is named directly. Fetching it
// by id gives the amount to pre-filter charges by.
export const MASTERCLASS_PRICE_ID = "price_1U83RgGic4Z3oeZE5tmRWbwD";
export const MASTERCLASS_PRICE_FALLBACK = 9700;
export const MASTERCLASS_PAYMENT_LINK = "https://buy.stripe.com/aFa7sL71z6DfajJ7sBgnL3w";
export const MASTERCLASS_SEATS = 20;

export type StripeCharge = {
  id: string;
  amount: number;
  status: string;
  created: number;
  invoice: string | null;
  refunded?: boolean;
  billing_details?: { name?: string | null; email?: string | null } | null;
  payment_intent?: string | null;
};

export type Buyer = {
  id: string;
  name: string | null;
  email: string | null;
  purchased_at: string;
  amount: number;
};

/**
 * A charge counts as a purchase when it succeeded, was not refunded, and is not
 * a subscription renewal. `invoice` is the discriminator: one-time payments
 * carry none, subscription charges always do.
 */
export function isPurchase(charge: StripeCharge): boolean {
  if (charge.status !== "succeeded") return false;
  if (charge.refunded === true) return false;
  if (charge.invoice) return false;
  return true;
}

function cleanEmail(value: string | null | undefined): string | null {
  const email = (value ?? "").trim().toLowerCase();
  return email.includes("@") ? email : null;
}

/** One row per human. A repeat charge from the same person is still one buyer. */
export function toBuyers(charges: StripeCharge[]): Buyer[] {
  const byPerson = new Map<string, Buyer>();
  for (const charge of charges) {
    if (!isPurchase(charge)) continue;
    const email = cleanEmail(charge.billing_details?.email);
    const key = email ?? charge.id;
    const buyer: Buyer = {
      id: charge.id,
      name: (charge.billing_details?.name ?? "").trim() || null,
      email,
      purchased_at: new Date(charge.created * 1000).toISOString(),
      amount: charge.amount,
    };
    const existing = byPerson.get(key);
    // Keep the earliest purchase: that is when they actually joined.
    if (!existing || buyer.purchased_at < existing.purchased_at) byPerson.set(key, buyer);
  }
  return [...byPerson.values()].sort((a, b) => b.purchased_at.localeCompare(a.purchased_at));
}

export type SeatCount = { sold: number; total: number; remaining: number };

/** Never negative, never more than the room holds. */
export function seatCount(sold: number, total = MASTERCLASS_SEATS): SeatCount {
  const safeSold = Number.isFinite(sold) && sold > 0 ? Math.floor(sold) : 0;
  return { sold: safeSold, total, remaining: Math.max(0, total - safeSold) };
}

/**
 * How the seat line should read. Below five left it names the number, because
 * that is when it is both true and worth saying; above that it stays general
 * rather than manufacturing pressure.
 */
export function seatLine(seats: SeatCount): string {
  if (seats.remaining === 0) return "All seats are taken";
  if (seats.remaining === 1) return "1 seat left";
  if (seats.remaining <= 5) return `Only ${seats.remaining} seats left`;
  return `${seats.remaining} of ${seats.total} seats left`;
}

/** An email a person will never receive. Worth flagging rather than silently failing. */
export function looksMistyped(email: string | null): boolean {
  if (!email) return false;
  return /@(gmai|gmial|gmal|gmail\.co|hotmial|yaho|outlok)\.?[a-z]*$/i.test(email) && !/@gmail\.com$/i.test(email);
}
