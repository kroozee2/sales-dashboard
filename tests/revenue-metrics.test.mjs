import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test, { mock } from "node:test";

import {
  collectedManualPayments,
  dashboardBookedRevenueEvents,
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
  assert.equal(saleRevenueAmount({ deal_amount: 12_000, new_revenue: 1_000, cc_upfront: 500 }), 1_000);
  assert.equal(saleRevenueAmount({ deal_amount: 12_000, new_revenue: 0, cc_upfront: 500 }), 0);
  assert.equal(saleRevenueAmount({ deal_amount: 12_000, new_revenue: null, cc_upfront: 500 }), 12_000);
  assert.equal(saleRevenueAmount({ deal_amount: null, new_revenue: null, cc_upfront: 3_000 }), 3_000);
});

test("non-Stripe sale contributes contract value to booked revenue and collected installment to cash", () => {
  const events = dashboardBookedRevenueEvents([
    {
      name: "Chris Contreras",
      result: "✅ Sale",
      call_date: "2026-09-03T18:30:00+00:00",
      deal_amount: 6_000,
      new_revenue: 6_000,
      cc_upfront: 3_000,
      offer: "Content & Conversion Accelerator",
    },
  ]);

  const cash = collectedManualPayments([
    {
      name: "Chris Contreras — Commas payment 1 of 2",
      amount: 3_000,
      payment_type: "one_off",
      status: "collected",
      payment_date: "2026-09-03",
      source: "Commas",
    },
    {
      name: "Chris Contreras — Commas payment 2 of 2",
      amount: 3_000,
      payment_type: "one_off",
      status: "scheduled",
      payment_date: "2026-10-03",
      source: "Commas",
    },
  ], "2026-09-01");

  assert.deepEqual(events, [{
    name: "Chris Contreras",
    amount: 6_000,
    date: "2026-09-03T18:30:00+00:00",
    kind: "Sale",
    offer: "Content & Conversion Accelerator",
  }]);
  assert.deepEqual(cash.map((payment) => payment.amount), [3_000]);
});

test("home GET excludes manual payments from booked revenue, its series, and recent activity", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL = "https://salesos-route-test.invalid";
  process.env.SUPABASE_CALLS_SERVICE_KEY = "test-service-key";

  const now = new Date();
  const saleDate = new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 1), 0, 0, 0).toISOString();
  const sale = {
    id: "sale-1",
    name: "Chris Contreras",
    call_date: saleDate,
    result: "✅ Sale",
    deal_amount: 6_000,
    new_revenue: 6_000,
    cc_upfront: 3_000,
    offer: "Content & Conversion Accelerator",
    call_type: "Strategy Call",
  };
  const collectedPayment = {
    name: "Chris Contreras — Commas payment 1 of 2",
    amount: 3_000,
    interval_type: null,
    next_bill_date: null,
    payment_type: "one_off",
    status: "collected",
  };
  let manualPaymentQueries = 0;

  mock.method(globalThis, "fetch", async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const table = url.pathname.split("/").at(-1);
    let rows = [];

    if (table === "sales_calls") rows = [sale];
    if (table === "offers") rows = [];
    if (table === "manual_payments") {
      manualPaymentQueries += 1;
      rows = [collectedPayment];
    }

    const headers = { "content-type": "application/json", "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` };
    return new Response(init?.method === "HEAD" ? null : JSON.stringify(rows), { status: 200, headers });
  });

  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "next/server") return nextResolve("next/server.js", context);
      if (specifier === "@/lib/revenue-metrics") {
        return { shortCircuit: true, url: new URL("../lib/revenue-metrics.ts", import.meta.url).href };
      }
      return nextResolve(specifier, context);
    },
  });
  const { GET } = await import("../app/api/home/route.ts");
  const { NextRequest } = await import("next/server.js");
  hooks.deregister();
  const response = await GET(new NextRequest("http://localhost/api/home?period=month"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(manualPaymentQueries, 1);
  assert.equal(body.revenue, 6_000);
  assert.equal(body.salesCount, 1);
  assert.equal(body.series.filter((point) => point.cur !== null).at(-1)?.cur, 6_000);
  assert.deepEqual(body.recent.map(({ name, amount, kind }) => ({ name, amount, kind })), [
    { name: "Chris Contreras", amount: 6_000, kind: "Sale" },
  ]);
});

test("cash revenue is net of full and partial Stripe refunds", () => {
  assert.equal(netSucceededChargeCents({ status: "succeeded", amount: 100_000, amount_refunded: 25_000 }), 75_000);
  assert.equal(netSucceededChargeCents({ status: "succeeded", amount: 100_000, amount_refunded: 100_000 }), 0);
  assert.equal(netSucceededChargeCents({ status: "failed", amount: 100_000, amount_refunded: 0 }), 0);
});
