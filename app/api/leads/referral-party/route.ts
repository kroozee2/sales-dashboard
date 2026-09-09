import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { EVENT_TITLE, nextParty } from "@/lib/referral-party";

export const runtime = "nodejs";

// Queue a lead for the NEXT 🎉 7-Figure CEO Referral Party. Only ever the next
// occurrence, never the whole series, so an invited lead gets exactly one
// party on their calendar.
//
// The date maths and the calendar instance id both live in lib/referral-party
// now. They used to be inlined here against the retired series, which meant
// this route queued dead event ids that the invite-draining task could not act
// on, and labelled the party "3:00 PM ET" long after it had moved.

/** The shape the Leads panel already renders: a date and a human label. */
function summarise(p: ReturnType<typeof nextParty>) {
  return { date: p.date, label: p.label, eventId: p.eventId };
}

// GET ?email= — the next party, plus whether this lead is already on it.
export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
  const party = summarise(nextParty());
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
  const party = summarise(nextParty());
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
    event_id: party.eventId,
    status: "queued",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ party, invite: data, eventTitle: EVENT_TITLE });
}
