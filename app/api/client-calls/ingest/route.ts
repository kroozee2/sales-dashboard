import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

// Pulls the weekly group call in and writes a row.
//
// The call is identified by its calendar event, not by the recording's title —
// Zoom names every session "Andrew Kroeze's Personal Meeting Room", so the title
// cannot tell one call from another. The event name is the anchor.
//
// Fathom is the source this can reach on its own (FATHOM_API_KEY). Zoom needs
// credentials the app does not have, so Zoom weeks are written by the agent
// through POST with a supplied payload rather than fetched here.

export const runtime = "nodejs";
export const maxDuration = 300;

const EVENT_MATCH = /claude ai|ai \+ systems|systems for founders/i;

type Attendee = { name: string; email?: string | null; source: string };
type FollowUp = { text: string; owner?: string | null };

// The recap that goes to the community. Written here so the wording is
// consistent week to week, and left as a draft for Andrew to approve.
function draftRecap(opts: {
  title: string; date: string; attendees: Attendee[]; followUps: FollowUp[]; link: string | null;
}) {
  const when = new Date(`${opts.date}T12:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const lines = [
    `🎥 ${opts.title} — ${when}`,
    "",
    `Replay is up${opts.link ? `: ${opts.link}` : "."}`,
  ];
  if (opts.followUps.length) {
    lines.push("", "What to action this week:");
    for (const f of opts.followUps.slice(0, 6)) lines.push(`• ${f.text}${f.owner ? ` (${f.owner})` : ""}`);
  }
  lines.push("", `${opts.attendees.length} on the call. If you missed it, the replay covers everything.`);
  return lines.join("\n");
}

async function fathomCall(dateISO: string) {
  const key = process.env.FATHOM_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://api.fathom.ai/external/v1/meetings?created_after=${dateISO}T00:00:00Z&include_action_items=true`, {
    headers: { "X-Api-Key": key }, cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { items?: Record<string, unknown>[] };
  return (body.items ?? []).find((m) => EVENT_MATCH.test(String(m.title ?? ""))) ?? null;
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const meeting = await fathomCall(date);
  if (!meeting) {
    return NextResponse.json({
      found: false,
      note: "No Fathom recording matched the call for that date. Zoom weeks are written by the agent, which has the Zoom credentials this app does not.",
    });
  }

  // Fathom reports who was actually matched to a speaker; the invitee list is
  // who was asked, which is a different and much longer list.
  const invitees = (meeting.calendar_invitees as Record<string, unknown>[] ?? []);
  const attendees: Attendee[] = invitees
    .filter((i) => i.matched_speaker_display_name)
    .map((i) => ({ name: String(i.name ?? ""), email: (i.email as string) ?? null, source: "fathom-speaker" }));

  const followUps: FollowUp[] = ((meeting.action_items as Record<string, unknown>[]) ?? []).map((a) => ({
    text: String(a.description ?? ""),
    owner: ((a.assignee as Record<string, unknown>)?.name as string) ?? null,
  }));

  const row = {
    call_date: String(meeting.scheduled_start_time ?? meeting.created_at ?? date).slice(0, 10),
    title: String(meeting.title ?? "Claude AI + Systems for Founders Call"),
    source: "fathom",
    external_id: `fathom:${meeting.recording_id}`,
    recording_url: (meeting.url as string) ?? null,
    share_url: (meeting.share_url as string) ?? null,
    attendees, attendee_count: attendees.length, invited_count: invitees.length,
    follow_ups: followUps,
    summary: (meeting.default_summary as string) ?? null,
  };

  const draft = draftRecap({ ...row, date: row.call_date, attendees, followUps, link: row.share_url });
  const { data, error } = await createLeadsAdminClient().from("client_calls")
    .upsert({ ...row, fam_draft: draft, mastermind_draft: draft }, { onConflict: "external_id" })
    .select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ found: true, call: data });
}

// POST — the agent's path, for weeks recorded somewhere this app cannot reach.
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.external_id || !b.call_date) {
    return NextResponse.json({ error: "external_id and call_date are required" }, { status: 400 });
  }
  const attendees = (b.attendees as Attendee[]) ?? [];
  const followUps = (b.follow_ups as FollowUp[]) ?? [];
  const title = String(b.title ?? "Claude AI + Systems for Founders Call");
  const draft = draftRecap({
    title, date: String(b.call_date), attendees, followUps,
    link: (b.share_url as string) ?? (b.recording_url as string) ?? null,
  });

  const { data, error } = await createLeadsAdminClient().from("client_calls").upsert({
    call_date: b.call_date, title, source: b.source ?? "zoom",
    external_id: b.external_id, recording_url: b.recording_url ?? null, share_url: b.share_url ?? null,
    duration_minutes: b.duration_minutes ?? null,
    attendees, attendee_count: attendees.length, invited_count: b.invited_count ?? null,
    summary: b.summary ?? null, follow_ups: followUps,
    fam_draft: b.fam_draft ?? draft, mastermind_draft: b.mastermind_draft ?? draft,
  }, { onConflict: "external_id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, call: data });
}
