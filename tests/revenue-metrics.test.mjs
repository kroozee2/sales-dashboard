import assert from "node:assert/strict";
import test from "node:test";

import {
  collectedManualPayments,
  netSucceededChargeCents,
  saleRevenueAmount,
  summarizeRecurringRevenue,
} from "../lib/revenue-metrics.ts";

test("counts live subscriptions and verified future installments in MRR exactly once", () => {
  const summary = summarizeRecurringRevenue([
    { id: "sub_live", status: "active", monthlyAmount: 1_000 },
    { id: "sched_scott", status: "active", monthlyAmount: 3_000 },
    { id: "sched_emeka", status: "active", monthlyAmount: 3_000 },
    { id: "sub_paused", status: "paused", monthlyAmount: 2_000 },
  ]);

  assert.deepEqual(summary, { mrr: 7_000, totalActive: 3, totalPaused: 1 });
});

test("excludes a balance due promise until it is actually collected", () => {
  const rows = [
    { id: "paid", payment_type: "one_off", status: "collected", amount: 3_000, payment_date: "2026-08-13" },
    { id: "balance-due", payment_type: "one_off", status: "scheduled", amount: 5_000, payment_date: "2026-08-13" },
    { id: "old", payment_type: "one_off", status: "collected", amount: 2_000, payment_date: "2026-07-31" },
    { id: "recurring", payment_type: "recurring", status: "active", amount: 1_000, payment_date: "2026-08-13" },
  ];

  assert.deepEqual(collectedManualPayments(rows, "2026-08-01").map((row) => row.id), ["paid"]);
});

test("dashboard booked revenue prefers explicit new revenue, then falls back to deal value and cash upfront", () => {
  assert.equal(saleRevenueAmount({ deal_amount: 12_000, new_revenue: 1_000, cc_upfront: 1_000 }), 1_000);
  assert.equal(saleRevenueAmount({ deal_amount: 6_000, new_revenue: null, cc_upfront: 3_000 }), 6_000);
  assert.equal(saleRevenueAmount({ deal_amount: null, new_revenue: null, cc_upfront: 3_000 }), 3_000);
});

test("cash revenue is net of full and partial Stripe refunds", () => {
  assert.equal(netSucceededChargeCents({ status: "succeeded", amount: 100_000, amount_refunded: 25_000 }), 75_000);
  assert.equal(netSucceededChargeCents({ status: "succeeded", amount: 100_000, amount_refunded: 100_000 }), 0);
  assert.equal(netSucceededChargeCents({ status: "failed", amount: 100_000, amount_refunded: 0 }), 0);
});
