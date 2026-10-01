import { NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { groupPhoneKeys, isInGroup } from "@/lib/whatsapp-membership";
import { nextParty } from "@/lib/referral-party";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Everyone who signed up through the public Referral Party page
// (referral-party-puce.vercel.app), with what happened to them afterwards.
//
// Three tables carry three different facts and all three matter here:
//
//   referral_party_signups   who signed up, when, and whether they tapped
//                            through to the WhatsApp group
//   referral_party_invites   whether the calendar invite has actually been
//                            written onto the Google event yet
//   the WhatsApp group       who is genuinely in the chat, read live
//
// The WhatsApp group is the honest answer to "did they get in", but it can
// only be read when Unipile is configured, and only for people whose number we
// hold. When it cannot be read, the page falls back to the tap, which is a
// weaker signal and is labelled as one rather than dressed up as membership.

type SignupRow = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  event_date: string;
  ghl_contact_id: string | null;
  lead_id: string | null;
  whatsapp_clicked_at: string | null;
  source: string | null;
  created_at: string;
};

type InviteRow = { email: string; event_date: string; status: string | null; invited_at: string | null };

export async function GET() {
  const db = createLeadsAdminClient();

  const { data: signups, error } = await db
    .from("referral_party_signups")
    .select("id, name, email, phone, event_date, ghl_contact_id, lead_id, whatsapp_clicked_at, source, created_at")
    .order("created_at", { ascending: false })
    .returns<SignupRow[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = signups ?? [];

  // Invite status, keyed the same way the queue is: email plus party date.
  const inviteBy = new Map<string, InviteRow>();
  if (rows.length) {
    const { data: invites } = await db
      .from("referral_party_invites")
      .select("email, event_date, status, invited_at")
      .in("email", [...new Set(rows.map((r) => r.email))])
      .returns<InviteRow[]>();
    for (const i of invites ?? []) inviteBy.set(`${i.email.toLowerCase()}|${i.event_date}`, i);
  }

  // Read once for the whole list rather than per person. Returns null when
  // Unipile is not configured or the group could not be found, which the page
  // renders as "unknown" rather than as "not joined".
  const groupKeys = rows.length
    ? await groupPhoneKeys({
        jid: process.env.WHATSAPP_REFERRAL_PARTY_JID ?? null,
        nameHint: process.env.WHATSAPP_REFERRAL_PARTY_NAME ?? "Referral Fam",
      })
    : null;

  const party = nextParty();

  return NextResponse.json({
    signups: rows.map((r) => {
      const invite = inviteBy.get(`${r.email.toLowerCase()}|${r.event_date}`) ?? null;
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        event_date: r.event_date,
        signed_up_at: r.created_at,
        tapped_whatsapp_at: r.whatsapp_clicked_at,
        in_whatsapp_group: isInGroup(r.phone, groupKeys),
        in_ghl: Boolean(r.ghl_contact_id),
        invite_status: invite?.status ?? null,
        invited_at: invite?.invited_at ?? null,
        source: r.source,
      };
    }),
    next_party: { date: party.date, label: party.label },
    whatsapp_group_read: groupKeys !== null,
    generated_at: new Date().toISOString(),
  });
}
