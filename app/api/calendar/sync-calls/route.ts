import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 120;

const GHL_BASE = "https://services.leadconnectorhq.com";
const ANDREW_USER_ID = "iVqhzUsWWh50xEVW4JRr";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);

type GhlContact = { firstName?: string; lastName?: string; contactName?: string; email?: string; phone?: string };

async function getContact(id: string, apiKey: string): Promise<GhlContact | null> {
  try {
    const r = await fetch(`${GHL_BASE}/contacts/${id}`, { headers: { Authorization: `Bearer ${apiKey}`, Version: "2021-07-28" }, cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.contact ?? null) as GhlContact | null;
  } catch { return null; }
}

// Collapse an exact doubled name ("Scott Zimmerman Scott Zimmerman" → "Scott Zimmerman").
function dedupeName(s: string): string {
  const parts = s.trim().split(/\s+/);
  if (parts.length >= 2 && parts.length % 2 === 0) {
    const half = parts.length / 2;
    if (parts.slice(0, half).join(" ").toLowerCase() === parts.slice(half).join(" ").toLowerCase()) return parts.slice(0, half).join(" ");
  }
  return s.trim();
}
// Parse "Name | Calendar" GHL titles.
function nameFromTitle(title: string): string {
  return dedupeName((title.split("|")[0] ?? "").trim());
}

// Sync Andrew's booked 1-on-1 sales calls from GoHighLevel into sales_calls.
// Upserts by calendar_event_id and never overwrites logged outcome/notes.
export async function POST() {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID || "ZJQSLWJWH7OVHVrJjmPj";
  if (!apiKey) return NextResponse.json({ error: "GHL not configured" }, { status: 500 });

  const now = Date.now();
  const start = now - 2 * 24 * 60 * 60 * 1000;   // include the last 2 days
  const end = now + 45 * 24 * 60 * 60 * 1000;     // and the next 45 days

  try {
    const url = new URL(`${GHL_BASE}/calendars/events`);
    url.searchParams.set("locationId", locationId);
    url.searchParams.set("userId", ANDREW_USER_ID);
    url.searchParams.set("startTime", String(start));
    url.searchParams.set("endTime", String(end));
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${apiKey}`, Version: "2021-04-15" }, cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: `GHL ${res.status}` }, { status: 502 });
    const data = await res.json();
    const events: Array<{ id: string; title?: string; startTime: string; contactId?: string; appointmentStatus?: string; deleted?: boolean }> = data.events ?? [];

    // 1-on-1 booked sales calls: has a contact and isn't cancelled.
    const calls = events.filter((e) => e.contactId && e.appointmentStatus !== "cancelled" && !e.deleted);

    // Which of these already exist? (so we set call_type only on first insert and
    // never overwrite a type Andrew changed manually.)
    const eventIds = calls.map((e) => e.id);
    const { data: existingRows } = eventIds.length
      ? await db.from("sales_calls").select("calendar_event_id").in("calendar_event_id", eventIds)
      : { data: [] as { calendar_event_id: string }[] };
    const existing = new Set((existingRows ?? []).map((r) => r.calendar_event_id));

    let synced = 0;
    for (const e of calls) {
      const contact = e.contactId ? await getContact(e.contactId, apiKey) : null;
      const rawName = contact?.contactName || [contact?.firstName, contact?.lastName].filter(Boolean).join(" ").trim() || nameFromTitle(e.title ?? "") || "Prospect";
      const name = dedupeName(rawName);
      // Fields we always keep fresh from the calendar (never touches call_type/result/notes).
      const base = {
        calendar_event_id: e.id,
        name,
        email: contact?.email ?? null,
        phone: contact?.phone ?? null,
        ghl_contact_id: e.contactId ?? null,
        ghl_url: e.contactId ? `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${e.contactId}` : null,
        call_date: new Date(e.startTime).toISOString(),
        booking_source: "📅 Calendar",
        confirmed: e.appointmentStatus === "confirmed" ? "✅ Confirmed" : null,
      };
      if (existing.has(e.id)) {
        const { error } = await db.from("sales_calls").update(base).eq("calendar_event_id", e.id);
        if (!error) synced++;
      } else {
        // New call: default the type to Sales Call. Andrew can change it after.
        const { error } = await db.from("sales_calls").insert({ ...base, call_type: "📞 Sales Call" });
        if (!error) synced++;
      }
      await new Promise((r) => setTimeout(r, 60));
    }
    return NextResponse.json({ ok: true, synced, found: calls.length });
  } catch (err) {
    console.error("sync-calls error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "sync failed" }, { status: 500 });
  }
}

// Allow a GET too (handy for cron / manual runs).
export async function GET() { return POST(); }
