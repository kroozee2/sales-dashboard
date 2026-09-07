import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

// The Leads dashboard.
//
// Where each number comes from, and why:
//
//   New leads + where they came from -> GoHighLevel, not the leads table. The
//     leads table has all but stopped recording arrivals (1 row in September, 4
//     in August) while GHL took ~150 opt-ins in the same window, and its source
//     column is "Unknown" on 944 of 1,000 rows. GHL is where new leads actually
//     land, so that is what is counted.
//
//   Calls booked + where they booked -> the sales_calls table, which has 837
//     records with a real booking_source spread (Paid Trial, Calendar, Skool,
//     Facebook, Referral, VSL).
//
//   Counted by call_date, NOT the date booked. booking_date is empty on all 837
//     rows and created_at is distorted by a bulk import (751 of 837 landed in
//     one June day), so neither can answer "booked in month X" honestly.

export const runtime = "nodejs";
export const maxDuration = 60;

const GHL_BASE = "https://services.leadconnectorhq.com";
const LOCATION_ID = process.env.GHL_LOCATION_ID || "ZJQSLWJWH7OVHVrJjmPj";
const ghlHeaders = () => ({
  Authorization: `Bearer ${process.env.GHL_API_KEY}`,
  "Content-Type": "application/json",
  Version: "2021-07-28",
});

type Period = "month" | "quarter" | "year";
type Bucket = { key: string; label: string; leads: number; calls: number };

function bucketsFor(period: Period): { keys: string[]; label: (k: string) => string; keyOf: (iso: string) => string } {
  const now = new Date();
  if (period === "year") {
    const years = Array.from({ length: 3 }, (_, i) => String(now.getFullYear() - 2 + i));
    return { keys: years, label: (k) => k, keyOf: (iso) => iso.slice(0, 4) };
  }
  if (period === "quarter") {
    const keys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i * 3, 1);
      keys.push(`${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`);
    }
    return {
      keys: [...new Set(keys)],
      label: (k) => k.replace("-", " "),
      keyOf: (iso) => `${iso.slice(0, 4)}-Q${Math.floor(Number(iso.slice(5, 7) || "1") / 3.01) + 1}`,
    };
  }
  const keys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return {
    keys,
    label: (k) => new Date(`${k}-01T12:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
    keyOf: (iso) => iso.slice(0, 7),
  };
}

const tidy = (t: string) =>
  t.replace(/"/g, "").replace(/[-_]+/g, " ").replace(/skoolcommunity/i, "Skool").replace(/\b\w/g, (m) => m.toUpperCase()).trim();

function optInSource(c: { tags?: string[]; attributions?: { medium?: string }[]; source?: string }) {
  const tag = (c.tags ?? []).map((t) => t.replace(/"/g, "").trim()).filter(Boolean)[0];
  if (tag) return tidy(tag);
  const medium = c.attributions?.[0]?.medium?.toLowerCase();
  if (medium === "zapier") return "Lead magnet";
  if (medium === "calendar") return "Booked a call";
  if (medium) return tidy(medium);
  return c.source ? tidy(c.source) : "Unknown";
}

export async function GET(req: NextRequest) {
  const period = (req.nextUrl.searchParams.get("period") ?? "month") as Period;
  const { keys, label, keyOf } = bucketsFor(period);
  const earliest = keys[0];

  const buckets = new Map<string, Bucket>(keys.map((k) => [k, { key: k, label: label(k), leads: 0, calls: 0 }]));
  const leadSources = new Map<string, number>();
  const bookingSources = new Map<string, number>();
  const leadTypes = new Map<string, number>();
  let scanned = 0, skippedInstagram = 0, totalLeads = 0, totalCalls = 0;
  let oldestSeen: string | null = null;

  // ── Calls: booked and where from, straight out of Supabase.
  try {
    const db = createLeadsAdminClient();
    const { data } = await db
      .from("sales_calls")
      .select("call_date, booking_source, prospect_quality")
      .not("call_date", "is", null)
      .limit(5000);
    for (const c of data ?? []) {
      const iso = String(c.call_date);
      const k = keyOf(iso);
      const b = buckets.get(k);
      if (!b) continue;
      b.calls++; totalCalls++;
      const src = (c.booking_source as string) || "🤔 Unknown";
      bookingSources.set(src, (bookingSources.get(src) ?? 0) + 1);
      const q = (c.prospect_quality as string) || "Unrated";
      leadTypes.set(q, (leadTypes.get(q) ?? 0) + 1);
    }
  } catch { /* the panel degrades to zeroes rather than failing the page */ }

  // ── New leads: GoHighLevel opt-ins, Instagram excluded, paged until the
  //    window is covered or the scan cap is reached.
  if (process.env.GHL_API_KEY) {
    let url = `${GHL_BASE}/contacts/?locationId=${LOCATION_ID}&limit=100`;
    const MAX_PAGES = period === "month" ? 25 : 40;
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await fetch(url, { headers: ghlHeaders(), cache: "no-store" });
        if (!res.ok) break;
        const body = (await res.json()) as {
          contacts?: { dateAdded?: string; tags?: string[]; attributions?: { medium?: string }[]; source?: string }[];
          meta?: { nextPageUrl?: string };
        };
        const batch = body.contacts ?? [];
        if (!batch.length) break;
        scanned += batch.length;

        let allOlder = true;
        for (const c of batch) {
          const iso = c.dateAdded ?? "";
          if (!iso) continue;
          if (!oldestSeen || iso < oldestSeen) oldestSeen = iso;
          if (keyOf(iso) >= earliest) allOlder = false;
          if (c.attributions?.[0]?.medium?.toLowerCase() === "instagram") { skippedInstagram++; continue; }
          const b = buckets.get(keyOf(iso));
          if (!b) continue;
          b.leads++; totalLeads++;
          const src = optInSource(c);
          leadSources.set(src, (leadSources.get(src) ?? 0) + 1);
        }
        // GHL returns newest first, so once a whole page predates the window we are done.
        if (allOlder || !body.meta?.nextPageUrl) break;
        url = body.meta.nextPageUrl;
      }
    } catch { /* partial data beats an error page */ }
  }

  const top = (m: Map<string, number>, n = 8) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));

  return NextResponse.json({
    period,
    buckets: keys.map((k) => buckets.get(k)!),
    totals: { leads: totalLeads, calls: totalCalls },
    lead_sources: top(leadSources),
    booking_sources: top(bookingSources),
    lead_types: top(leadTypes, 6),
    // A month older than the scan reached has no lead figure — that is different
    // from a month with no leads, and the UI says so rather than showing 0.
    scan: { scanned, skipped_instagram: skippedInstagram, leads_scanned_back_to: oldestSeen },
    // Said plainly so the number is never mistaken for something it isn't.
    calls_counted_by: "call_date",
  });
}
