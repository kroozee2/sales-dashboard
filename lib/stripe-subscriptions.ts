type StripeCustomerLike = {
  id?: string;
  name?: string | null;
  email?: string | null;
  deleted?: unknown;
};

type StripePriceLike = {
  id?: string;
  unit_amount?: number | null;
  currency?: string;
  recurring?: { interval?: string | null } | null;
  product?: string | { id?: string } | null;
};

type StripeItemLike = {
  id?: string;
  current_period_end?: number;
  price?: StripePriceLike | string | null;
  plan?: StripePriceLike | string | null;
  quantity?: number | null;
};

type StripeSubscriptionLike = {
  id: string;
  customer?: StripeCustomerLike | string | null;
  items?: { data?: StripeItemLike[] } | StripeItemLike[];
  status?: string;
  start_date?: number;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string> | null;
  pause_collection?: unknown;
};

type StripeScheduleLike = {
  id: string;
  customer?: StripeCustomerLike | string | null;
  status?: string;
  phases?: Array<{
    start_date?: number;
    end_date?: number;
    currency?: string;
    items?: StripeItemLike[];
  }>;
  metadata?: Record<string, string> | null;
};

export type BillingRow = {
  id: string;
  itemId: string | null;
  priceId: string | null;
  currency: string;
  name: string;
  email: string | null;
  offer: string;
  amount: number;
  monthlyAmount: number;
  interval: string;
  status: "active" | "paused";
  nextBill: string;
  nextBillTs: number | null;
  startDate: string;
  customerId: string | null;
  billingSource: "subscription" | "schedule";
  finalPayment: boolean;
};

const PRODUCT_CATEGORY: Record<string, string> = {
  prod_THiqJJWf5fAFLn: "BOARDROOM",
  prod_SUcGUmlKVAt0SW: "LAUNCH",
  prod_TKHEckSOuH5s: "LAUNCH",
  prod_UW2ll9z9DcUhuE: "AI Mastermind",
  prod_TzqtjPwO1SsVfV: "30-Day Accelerator",
  prod_UZ1e89xqXnhjcp: "Consulting",
  prod_V0petRKOn9Pt8e: "Skool Launch System",
};

function priceFromItem(item?: StripeItemLike): StripePriceLike {
  const price = item?.price ?? item?.plan;
  return price && typeof price !== "string" ? price : { id: typeof price === "string" ? price : undefined };
}

function customerFields(customer: StripeCustomerLike | string | null | undefined) {
  if (typeof customer === "string") return { id: customer, name: "Customer", email: null };
  return {
    id: customer?.id ?? null,
    name: customer?.deleted ? "Deleted customer" : customer?.name || "Customer",
    email: customer?.deleted ? null : customer?.email ?? null,
  };
}

function productId(price: StripePriceLike) {
  return typeof price.product === "string" ? price.product : price.product?.id ?? "";
}

function offerFor(metadata: Record<string, string> | null | undefined, price: StripePriceLike) {
  const fromMetadata = metadata?.offer;
  if (fromMetadata) return fromMetadata;
  const amount = price.unit_amount ?? 0;
  return PRODUCT_CATEGORY[productId(price)] || (amount >= 150_000 ? "BOARDROOM" : amount >= 80_000 ? "LAUNCH" : "Other");
}

function dateLabel(timestamp: number | null | undefined) {
  return timestamp
    ? new Date(timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "—";
}

function isFinal(metadata: Record<string, string> | null | undefined, cancelAtPeriodEnd = false) {
  return cancelAtPeriodEnd || /final/i.test(metadata?.payment ?? "");
}

export function mergeStripeBillingRows({
  subscriptions,
  schedules,
}: {
  subscriptions: StripeSubscriptionLike[];
  schedules: StripeScheduleLike[];
}): BillingRow[] {
  const rows: BillingRow[] = subscriptions.map((sub) => {
    const items = Array.isArray(sub.items) ? sub.items : sub.items?.data ?? [];
    const item = items[0];
    const price = priceFromItem(item);
    const customer = customerFields(sub.customer);
    const amountCents = price.unit_amount ?? 0;
    const interval = price.recurring?.interval ?? "month";
    const quantity = item?.quantity ?? 1;
    const monthlyAmountCents = interval === "year" ? (amountCents * quantity) / 12 : amountCents * quantity;
    const nextBillTs = item?.current_period_end ?? null;
    const paused = !!sub.pause_collection;

    return {
      id: sub.id,
      itemId: item?.id ?? null,
      priceId: price.id ?? null,
      currency: price.currency ?? "usd",
      name: customer.name,
      email: customer.email,
      offer: offerFor(sub.metadata, price),
      amount: (amountCents * quantity) / 100,
      monthlyAmount: monthlyAmountCents / 100,
      interval,
      status: paused ? "paused" : "active",
      nextBill: dateLabel(nextBillTs),
      nextBillTs,
      startDate: dateLabel(sub.start_date),
      customerId: customer.id,
      billingSource: "subscription",
      finalPayment: isFinal(sub.metadata, sub.cancel_at_period_end),
    };
  });

  const coveredScheduleIds = new Set(subscriptions.map((sub) => sub.id));
  for (const schedule of schedules) {
    if (schedule.status !== "not_started" || coveredScheduleIds.has(schedule.id)) continue;
    const phase = schedule.phases?.[0];
    const item = phase?.items?.[0];
    const price = priceFromItem(item);
    const customer = customerFields(schedule.customer);
    const amountCents = price.unit_amount ?? 0;
    const quantity = item?.quantity ?? 1;
    const interval = price.recurring?.interval ?? "month";
    const nextBillTs = phase?.start_date ?? null;

    rows.push({
      id: schedule.id,
      itemId: item?.id ?? null,
      priceId: price.id ?? null,
      currency: price.currency ?? phase?.currency ?? "usd",
      name: customer.name,
      email: customer.email,
      offer: offerFor(schedule.metadata, price),
      amount: (amountCents * quantity) / 100,
      monthlyAmount: (interval === "year" ? amountCents / 12 : amountCents) * quantity / 100,
      interval,
      status: "active",
      nextBill: dateLabel(nextBillTs),
      nextBillTs,
      startDate: dateLabel(nextBillTs),
      customerId: customer.id,
      billingSource: "schedule",
      finalPayment: isFinal(schedule.metadata, schedule.status === "not_started"),
    });
  }

  return rows.sort((a, b) => {
    if (!a.nextBillTs && !b.nextBillTs) return 0;
    if (!a.nextBillTs) return 1;
    if (!b.nextBillTs) return -1;
    return a.nextBillTs - b.nextBillTs;
  });
}
