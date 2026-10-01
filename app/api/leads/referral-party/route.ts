import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { REFERRAL_PARTY_TITLE, nextParty } from "@/lib/referral-party";
import {
  ReferralInviteInputError,
  normalizeReferralInviteRegistrant,
  readBoundedReferralInviteJson,
  referralInviteId,
} from "@/lib/referral-party-invites";

export const runtime = "nodejs";

function summarizeParty() {
  const party = nextParty();
  return { date: party.date, label: party.label, eventId: party.eventId };
}

function safeError(status = 500) {
  return NextResponse.json({ error: "Unable to update the Referral Party invite right now." }, { status });
}

// GET ?email= — the next party, plus whether this lead is already on it.
export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
  const party = summarizeParty();
  if (!email) return NextResponse.json({ party, invite: null });
  const { data, error } = await createLeadsAdminClient()
    .from("referral_party_invites")
    .select("status, invited_at")
    .eq("email", email).eq("event_date", party.date).maybeSingle();
  if (error) return safeError();
  return NextResponse.json({ party, invite: data ?? null });
}

// POST { lead_id, name, email } — atomically queue this lead for the next party.
export async function POST(req: NextRequest) {
  let body: { lead_id: string | null; name: string | null; email: string };
  try {
    body = normalizeReferralInviteRegistrant(await readBoundedReferralInviteJson(req));
  } catch (error) {
    const status = error instanceof ReferralInviteInputError ? error.status : 400;
    return NextResponse.json({ error: "Valid Referral Party invite details are required." }, { status });
  }

  const email = body.email;
  const party = summarizeParty();
  const db = createLeadsAdminClient();
  const { data: existing, error: existingError } = await db.from("referral_party_invites")
    .select("id, status").eq("email", email).eq("event_date", party.date).maybeSingle();
  if (existingError) return safeError();

  if (existing?.status === "failed") {
    const { data: retried, error } = await db.from("referral_party_invites")
      .update({ status: "queued", event_id: party.eventId, invited_at: null })
      .eq("id", existing.id).eq("status", "failed")
      .select("id, status").maybeSingle();
    if (error) return safeError();
    if (retried) return NextResponse.json({ party, invite: retried, retried: true });
    const { data: raced, error: racedError } = await db.from("referral_party_invites")
      .select("id, status").eq("id", existing.id).single();
    if (racedError) return safeError();
    return NextResponse.json({ party, invite: raced, alreadyQueued: true });
  }
  if (existing) return NextResponse.json({ party, invite: existing, alreadyQueued: true });

  const id = referralInviteId(email, party.date);
  const row = {
    id,
    lead_id: body.lead_id,
    name: body.name,
    email,
    event_date: party.date,
    event_id: party.eventId,
    status: "queued",
  };
  const { data, error } = await db.from("referral_party_invites")
    .upsert(row, { onConflict: "id", ignoreDuplicates: true })
    .select("id, status").maybeSingle();
  if (error) return safeError();
  if (data) return NextResponse.json({ party, invite: data, eventTitle: REFERRAL_PARTY_TITLE });

  const { data: concurrent, error: concurrentError } = await db.from("referral_party_invites")
    .select("id, status").eq("id", id).single();
  if (concurrentError) return safeError();
  return NextResponse.json({ party, invite: concurrent, alreadyQueued: true, eventTitle: REFERRAL_PARTY_TITLE });
}
