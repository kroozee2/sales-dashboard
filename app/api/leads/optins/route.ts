import { NextRequest, NextResponse } from "next/server";

// The opt-in feed behind Leads → New Leads.
//
// GoHighLevel is the source of truth for who opted in and when, so this reads
// it live rather than syncing into the leads table. Two fields carry the
// meaning: `dateAdded` is the opt-in date, and `attributions[].medium` is where
// it came from — instagram, zapier (how Skool and the lead magnets arrive),
// calendar, facebook.
//
// Instagram is dropped: it is the bulk of the list (100 of 100 in a sample) and
// Andrew works those elsewhere. Because GHL cannot filter by medium server-side,
// pages are pulled until enough non-Instagram opt-ins are found or the scan cap
// is hit — hence `scanned` in the response, so the UI can say what it looked at.

export const runtime = "nodejs";

const GHL_BASE = "https://services.leadconnectorhq.com";
const LOCATION_ID = process.env.GHL_LOCATION_ID || "ZJQSLWJWH7OVHVrJjmPj";
const PAGE_SIZE = 100;
const MAX_PAGES = 12; // ~1,200 contacts, comfortably inside the function timeout

const ghlHeaders = () => ({
  Authorization: `Bearer ${process.env.GHL_API_KEY}`,
  "Content-Type": "application/json",
  Version: "2021-07-28",
});

type Attribution = { medium?: string; utmSessionSource?: string; url?: string; pageUrl?: string };
type GhlContact = {
  id: string;
  firstName?: string; lastName?: string; contactName?: string;
  email?: string; phone?: string; dateAdded?: string;
  tags?: string[]; source?: string; attributions?: Attribution[];
};

// A readable "where they opted in", best signal first: an explicit tag beats a
// medium, which beats GHL's own source field.
function optedInVia(c: GhlContact): { label: string; medium: string | null } {
  const attribution = c.attributions?.[0];
  const medium = attribution?.medium?.toLowerCase() ?? null;
  const tag = (c.tags ?? []).map((t) => t.replace(/"/g, "").trim()).filter(Boolean)[0];

  if (tag) {
    const pretty = tag
      .replace(/[-_]+/g, " ")
      .replace(/skoolcommunity/i, "Skool")
      .replace(/\b\w/g, (m) => m.toUpperCase());
    return { label: pretty, medium };
  }
  if (medium === "zapier") return { label: "Lead magnet", medium };
  if (medium === "calendar") return { label: "Booked a call", medium };
  if (medium) return { label: medium.replace(/\b\w/g, (m) => m.toUpperCase()), medium };
  if (c.source) return { label: c.source, medium };
  return { label: "Unknown", medium };
}

export async function GET(req: NextRequest) {
  if (!process.env.GHL_API_KEY) {
    return NextResponse.json({ error: "GoHighLevel is not configured." }, { status: 500 });
  }
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? "100")));

  const optins: ReturnType<typeof shape>[] = [];
  let scanned = 0;
  let skippedInstagram = 0;
  let url = `${GHL_BASE}/contacts/?locationId=${LOCATION_ID}&limit=${PAGE_SIZE}`;

  function shape(c: GhlContact) {
    const via = optedInVia(c);
    const name = c.contactName || [c.firstName, c.lastName].filter(Boolean).join(" ") || null;
    return {
      id: c.id,
      name,
      email: c.email ?? null,
      phone: c.phone ?? null,
      opted_in_at: c.dateAdded ?? null,
      opted_in_via: via.label,
      medium: via.medium,
      ghl_url: `https://app.gohighlevel.com/v2/location/${LOCATION_ID}/contacts/detail/${c.id}`,
    };
  }

  try {
    for (let page = 0; page < MAX_PAGES && optins.length < limit; page++) {
      const res = await fetch(url, { headers: ghlHeaders(), cache: "no-store" });
      if (!res.ok) {
        return NextResponse.json({ error: `GoHighLevel returned ${res.status}` }, { status: 502 });
      }
      const body = (await res.json()) as { contacts?: GhlContact[]; meta?: { nextPageUrl?: string } };
      const batch = body.contacts ?? [];
      if (batch.length === 0) break;
      scanned += batch.length;

      for (const c of batch) {
        const medium = c.attributions?.[0]?.medium?.toLowerCase() ?? null;
        if (medium === "instagram") { skippedInstagram++; continue; }
        optins.push(shape(c));
      }
      if (!body.meta?.nextPageUrl) break;
      url = body.meta.nextPageUrl;
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not reach GoHighLevel" }, { status: 502 });
  }

  // Newest opt-in first.
  optins.sort((a, b) => (b.opted_in_at ?? "").localeCompare(a.opted_in_at ?? ""));
  return NextResponse.json({ optins: optins.slice(0, limit), scanned, skipped_instagram: skippedInstagram });
}
