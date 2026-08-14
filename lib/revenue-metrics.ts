export type RecurringRevenueRow = {
  id: string;
  status: "active" | "paused" | string;
  monthlyAmount: number;
};

export type ManualPaymentRevenueRow = {
  payment_type: string;
  status: string;
  amount: number;
  payment_date: string | null;
};

export type SaleRevenueFields = {
  deal_amount?: unknown;
  new_revenue?: unknown;
  cc_upfront?: unknown;
};

export type StripeChargeRevenueFields = {
  status?: string | null;
  amount?: number | null;
  amount_refunded?: number | null;
};

export function summarizeRecurringRevenue(rows: RecurringRevenueRow[]) {
  const active = rows.filter((row) => row.status === "active");
  return {
    mrr: Math.round(active.reduce((sum, row) => sum + Number(row.monthlyAmount || 0), 0)),
    totalActive: active.length,
    totalPaused: rows.filter((row) => row.status === "paused").length,
  };
}

export function collectedManualPayments<T extends ManualPaymentRevenueRow>(
  rows: T[],
  periodStart: string | null,
): T[] {
  return rows.filter((payment) => {
    if (payment.payment_type !== "one_off" || payment.status !== "collected") return false;
    if (Number(payment.amount) <= 0 || !payment.payment_date) return false;
    return !periodStart || payment.payment_date >= periodStart;
  });
}

export function saleRevenueAmount(sale: SaleRevenueFields): number {
  return Number(sale.new_revenue ?? 0)
    || Number(sale.deal_amount ?? 0)
    || Number(sale.cc_upfront ?? 0);
}

export function netSucceededChargeCents(charge: StripeChargeRevenueFields): number {
  if (charge.status !== "succeeded") return 0;
  return Math.max(0, Number(charge.amount ?? 0) - Number(charge.amount_refunded ?? 0));
}
