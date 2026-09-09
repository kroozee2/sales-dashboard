import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MASTERCLASS_PRODUCT_ID,
  MASTERCLASS_SEATS,
  isPurchase,
  looksMistyped,
  seatCount,
  seatLine,
  toBuyers,
} from "../lib/masterclass.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const charge = (overrides = {}) => ({
  id: "ch_1",
  amount: 9700,
  status: "succeeded",
  created: 1787700000,
  invoice: null,
  refunded: false,
  billing_details: { name: "Sonja Kaiser", email: "sonja.kaiser@ki-machen.de" },
  ...overrides,
});

// ---------------------------------------------------------------------------
// What counts as a purchase
// ---------------------------------------------------------------------------

test("a succeeded one-off charge is a purchase", () => {
  assert.equal(isPurchase(charge()), true);
});

test("a subscription renewal is not a purchase, even at the same price", () => {
  // Six $97 products exist and one $97 subscription renews monthly. Without
  // this, the same person counted as a new buyer every month.
  assert.equal(isPurchase(charge({ invoice: "in_123", billing_details: { name: "Rebecca", email: "r@example.com" } })), false);
});

test("failed and refunded charges are not purchases", () => {
  assert.equal(isPurchase(charge({ status: "failed" })), false);
  assert.equal(isPurchase(charge({ refunded: true })), false);
});

// ---------------------------------------------------------------------------
// Buyers
// ---------------------------------------------------------------------------

test("each buyer appears once, dated from their first purchase", () => {
  const buyers = toBuyers([
    charge({ id: "ch_late", created: 1787900000 }),
    charge({ id: "ch_early", created: 1787700000 }),
  ]);
  assert.equal(buyers.length, 1);
  assert.equal(buyers[0].id, "ch_early", "the first purchase is when they joined");
});

test("email is matched case and whitespace insensitively", () => {
  const buyers = toBuyers([
    charge({ id: "a", billing_details: { name: "Sonja", email: "  Sonja.Kaiser@KI-Machen.de " } }),
    charge({ id: "b", created: 1787800000, billing_details: { name: "Sonja Kaiser", email: "sonja.kaiser@ki-machen.de" } }),
  ]);
  assert.equal(buyers.length, 1);
});

test("a charge with no usable email still becomes a buyer, not a merge", () => {
  const buyers = toBuyers([
    charge({ id: "a", billing_details: { name: "One", email: null } }),
    charge({ id: "b", created: 1787800000, billing_details: { name: "Two", email: "not-an-email" } }),
  ]);
  assert.equal(buyers.length, 2, "two people without emails must not collapse into one");
});

test("buyers read newest first", () => {
  const buyers = toBuyers([
    charge({ id: "old", created: 1787600000, billing_details: { email: "a@x.com" } }),
    charge({ id: "new", created: 1787900000, billing_details: { email: "b@x.com" } }),
  ]);
  assert.deepEqual(buyers.map((b) => b.id), ["new", "old"]);
});

test("subscription renewals never reach the list", () => {
  const buyers = toBuyers([
    charge({ id: "buyer", billing_details: { email: "real@x.com" } }),
    charge({ id: "sub1", invoice: "in_1", billing_details: { email: "rebecca@x.com" } }),
    charge({ id: "sub2", invoice: "in_2", billing_details: { email: "rebecca@x.com" } }),
  ]);
  assert.deepEqual(buyers.map((b) => b.email), ["real@x.com"]);
});

// ---------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------

test("seats left is what is actually left", () => {
  assert.deepEqual(seatCount(4), { sold: 4, total: 20, remaining: 16 });
  assert.deepEqual(seatCount(20), { sold: 20, total: 20, remaining: 0 });
});

test("seats can never go negative or be faked by bad input", () => {
  assert.equal(seatCount(25).remaining, 0, "overselling shows none left, not minus five");
  assert.equal(seatCount(-3).sold, 0);
  assert.equal(seatCount(Number.NaN).sold, 0);
  assert.equal(seatCount(2.7).sold, 2);
});

test("the seat line tells the truth at every level", () => {
  assert.equal(seatLine(seatCount(4)), "16 of 20 seats left");
  assert.equal(seatLine(seatCount(16)), "Only 4 seats left");
  assert.equal(seatLine(seatCount(19)), "1 seat left");
  assert.equal(seatLine(seatCount(20)), "All seats are taken");
});

test("urgency is only claimed once it is real", () => {
  // "Only N left" reads as pressure. It is earned below five, not before.
  assert.doesNotMatch(seatLine(seatCount(4)), /^Only/);
  assert.match(seatLine(seatCount(16)), /^Only/);
});

test("the room size is the one the page promises", () => {
  assert.equal(MASTERCLASS_SEATS, 20);
});

// ---------------------------------------------------------------------------
// The product key, and a typo worth catching
// ---------------------------------------------------------------------------

test("buyers are keyed on the product, never on the price", () => {
  const lib = read("../lib/masterclass.ts");
  assert.equal(MASTERCLASS_PRODUCT_ID, "prod_V8K5dDj8B1LvHQ");
  assert.match(lib, /six different \$97 masterclass/i, "the reason is written down where it will be read");
});

test("an address that will bounce is flagged rather than ignored", () => {
  assert.equal(looksMistyped("simonposaune@gmai.com"), true);
  assert.equal(looksMistyped("someone@gmail.com"), false);
  assert.equal(looksMistyped("sonja.kaiser@ki-machen.de"), false);
  assert.equal(looksMistyped(null), false);
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

test("Masterclass is a Leads destination", () => {
  const sidebar = read("../components/sidebar.tsx");
  assert.match(sidebar, /href: "\/masterclass", label: "Masterclass".*section: "Leads"/);
});
