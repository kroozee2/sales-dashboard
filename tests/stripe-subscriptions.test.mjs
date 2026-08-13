import assert from "node:assert/strict";
import test from "node:test";

import { mergeStripeBillingRows } from "../lib/stripe-subscriptions.ts";

test("includes not-started subscription schedules as upcoming active payments", () => {
  const rows = mergeStripeBillingRows({
    subscriptions: [],
    schedules: [{
      id: "sub_sched_emeka",
      customer: { id: "cus_emeka", name: "Emeka Ajufo", email: "emeka@example.com" },
      status: "not_started",
      metadata: { offer: "Skool Launch System", payment: "final installment" },
      phases: [{
        start_date: 1_789_323_972,
        end_date: 1_791_915_972,
        currency: "usd",
        items: [{ price: { id: "price_launch", unit_amount: 300_000, recurring: { interval: "month" }, product: "prod_launch" }, quantity: 1 }],
      }],
    }],
  });

  assert.equal(rows.length, 1);
  assert.deepEqual(
    {
      id: rows[0].id,
      name: rows[0].name,
      amount: rows[0].amount,
      monthlyAmount: rows[0].monthlyAmount,
      status: rows[0].status,
      nextBillTs: rows[0].nextBillTs,
      billingSource: rows[0].billingSource,
      finalPayment: rows[0].finalPayment,
    },
    {
      id: "sub_sched_emeka",
      name: "Emeka Ajufo",
      amount: 3000,
      monthlyAmount: 3000,
      status: "active",
      nextBillTs: 1_789_323_972,
      billingSource: "schedule",
      finalPayment: true,
    },
  );
});

test("keeps live subscriptions and avoids duplicating a schedule-backed subscription", () => {
  const subscription = {
    id: "sub_jj",
    customer: { id: "cus_jj", name: "Julie Johnson Virgin", email: "jj@example.com" },
    status: "active",
    start_date: 1_785_928_469,
    cancel_at_period_end: true,
    metadata: { offer: "Skool Launch System", payment: "final installment" },
    items: { data: [{ id: "si_jj", current_period_end: 1_788_606_869, price: { id: "price_launch", unit_amount: 300_000, currency: "usd", recurring: { interval: "month" }, product: "prod_launch" } }] },
  };
  const rows = mergeStripeBillingRows({ subscriptions: [subscription], schedules: [] });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].nextBillTs, 1_788_606_869);
  assert.equal(rows[0].finalPayment, true);
});
