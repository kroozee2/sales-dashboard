import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OFFER_PAGE_ASSETS,
  OFFER_PAGE_CATEGORIES,
  filterOfferPageAssets,
} from "../lib/offer-page-assets.ts";

const root = process.cwd();

test("catalog contains Andrew's verified business pages with unique secure URLs", () => {
  assert.ok(OFFER_PAGE_ASSETS.length >= 20, "seed the verified business-page portfolio");
  assert.equal(new Set(OFFER_PAGE_ASSETS.map((asset) => asset.id)).size, OFFER_PAGE_ASSETS.length);
  assert.equal(new Set(OFFER_PAGE_ASSETS.map((asset) => asset.url)).size, OFFER_PAGE_ASSETS.length);
  assert.ok(OFFER_PAGE_ASSETS.every((asset) => asset.url.startsWith("https://")));
  for (const url of [
    "https://7fc-ai-mastermind-doc.vercel.app/",
    "https://7fc-case-studies.vercel.app/",
    "https://skool-launch.vercel.app/",
    "https://miami-event-five.vercel.app/",
    "https://webinar-funnel-eta.vercel.app/",
    "https://claude-for-founders.vercel.app/start",
    "https://listings-lab-offer.vercel.app/",
    "https://uare-growth-brief.vercel.app/",
    "https://masterclass-promo-hub.vercel.app/",
  ]) assert.ok(OFFER_PAGE_ASSETS.some((asset) => asset.url === url), `include ${url}`);
});

test("catalog covers funnels, lead magnets, client assets, member assets, and event assets", () => {
  assert.deepEqual(
    OFFER_PAGE_CATEGORIES.map((category) => category.id),
    ["all", "funnel", "lead-magnet", "client-asset", "member-asset", "event-asset"],
  );
  const present = new Set(OFFER_PAGE_ASSETS.map((asset) => asset.category));
  for (const category of OFFER_PAGE_CATEGORIES.slice(1)) assert.ok(present.has(category.id));
});

test("filter searches title, purpose, audience, and tags within a category", () => {
  assert.deepEqual(
    filterOfferPageAssets(OFFER_PAGE_ASSETS, "funnel", "mastermind").map((asset) => asset.id),
    ["7fc-ai-mastermind", "miami-ai-mastermind"],
  );
  assert.deepEqual(
    filterOfferPageAssets(OFFER_PAGE_ASSETS, "client-asset", "listings lab").map((asset) => asset.id),
    ["listings-lab-setting-system"],
  );
  assert.deepEqual(
    filterOfferPageAssets(OFFER_PAGE_ASSETS, "all", "speaker").map((asset) => asset.id),
    ["elite-live-speaker-kit", "masterclass-promo-hub", "miami-speaker-hub"],
  );
});

test("Offers page exposes Pages as the first top view and renders the portfolio", () => {
  const offers = readFileSync(join(root, "app", "offers", "page.tsx"), "utf8");
  assert.match(offers, /\['pages', '\ud83c\udf10 Pages'\]/);
  assert.ok(offers.indexOf("['pages', '🌐 Pages']") < offers.indexOf("['grid', '🔲 Grid']"));
  assert.match(offers, /<OfferPagesLibrary\s*\/>/);
});
