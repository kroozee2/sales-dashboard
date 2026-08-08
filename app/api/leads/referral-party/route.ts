import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

export const runtime = "nodejs";

// The 🎉 7-Figure CEO Referral Party runs on the 2nd Thursday of each month at
// 3:00 PM ET (Google series r0mjc229cjidri36bbkbhmfaj0). We only ever target the
// NEXT occurrence — never the whole series — so an invited lead gets exactly one
// party on their calendar.
const SERIES_ID = "r0mjc229cjidri36bbkbhmfaj0";
const EVENT_TITLE = "🎉 7-Figure CEO Referral Party";

/** The 2nd Thursday of a given UTC year/month, as YYYY-MM-DD. */
function secondThursday(year: number, month: number): string {
  const first = new Date(Date.UTC(year, month, 1));
  // 4 = Thursday. Walk forward to the first Thursday, then add a week.
  const offset = (4 - first.getUTCDay() + 7) % 7;
  const d = new Date(Date.UTC(year, month, 1 + offset + 7));
  return d.toISOString().slice(0, 10);
}

/** The next party that hasn't happened yet (today counts until it starts). */
export function nextParty(now = new Date()): { date: string; label: string } {
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  let date = secondThursday(y, m);
  // 19:00Z is 3pm ET during daylight time; once it's past, roll to next month.
  if (new Date(`${date}T19:00:00Z`).getTime() < now.getTime()) {
    date = secondThursday(m === 11 ? y + 1 : y, (m + 1) % 12);
  }
  const label = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC", weekday: "long", month: "long", day: "numeric",
  });
  return { date, label: `${label} · 3:00 PM ET` };
}

// GET ?email= — the next party, plus whether this lead is already on it.
export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
  const party = nextParty();
  if (!email) return NextResponse.json({ party, invite: null });
  const { data } = await createLeadsAdminClient()
    .from("referral_party_invites")
    .select("status, invited_at")
    .ilike("email", email).eq("event_date", party.date).maybeSingle();
  return NextResponse.json({ party, invite: data ?? null });
}

// POST { lead_id, name, email } — queue this lead for the next party.
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { lead_id?: string; name?: string; email?: string };
  const email = (b.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "This lead has no email address, so they can't be added to the invite." }, { status: 400 });
  }
  const party = nextParty();
  const db = createLeadsAdminClient();

  const { data: existing } = await db.from("referral_party_invites")
    .select("id, status").ilike("email", email).eq("event_date", party.date).maybeSingle();
  if (existing) {
    return NextResponse.json({ party, invite: existing, alreadyQueued: true });
  }

  const { data, error } = await db.from("referral_party_invites").insert({
    lead_id: b.lead_id ?? null,
    name: b.name ?? null,
    email,
    event_date: party.date,
    event_id: `${SERIES_ID}_${party.date.replace(/-/g, "")}T190000Z`,
    status: "queued",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ party, invite: data, eventTitle: EVENT_TITLE });
}
