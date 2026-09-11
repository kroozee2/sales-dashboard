import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { helmDb } from "@/lib/helm-clients";
import { matchHelmCall, resolveAttendance, type Attendee, type HelmGroupCall } from "@/lib/group-calls";

// The weekly group client calls: who showed up, what to follow up on, whether
// the recording went out, and the messages drafted for the WhatsApp groups.
//
// Read and write only. Ingest is a separate route because it reaches Zoom,
// Google Calendar and Fathom and takes far longer than a page load should.
//
// Nothing here sends a message. The drafts sit until Andrew presses send, and
// the send route records when he did.

export const runtime = "nodejs";

type Row = {
  id: string; call_date: string; title: string | null;
  attendees: Attendee[] | null; attendee_count: number | null;
};

/**
 * Attendance comes from Helm, which records a headcount and named attendees.
 * It used to come from Fathom's speaker matching, which returns nobody: the
 * most recent call has 178 invitees and not one matched speaker, and a member
 * who listens without speaking would never count anyway.
 */
async function helmGroupCalls(): Promise<HelmGroupCall[]> {
  const connection = await helmDb();
  if (!connection.ok) return [];
  const db = connection.db;

  const { data: calls, error } = await db
    .from("calls")
    .select("id,title,call_date,starts_at,attended")
    .eq("is_group", true)
    .order("starts_at", { ascending: false })
    .limit(200);
  if (error || !calls) return [];

  const ids = calls.map((c) => c.id as string);
  const { data: marked } = await db
    .from("group_call_attendees")
    .select("call_id,client_id")
    .in("call_id", ids);

  const clientIds = [...new Set((marked ?? []).map((m) => m.client_id as string).filter(Boolean))];
  const { data: people } = clientIds.length
    ? await db.from("clients").select("id,name,email").in("id", clientIds)
    : { data: [] as Record<string, unknown>[] };
  const byId = new Map((people ?? []).map((p) => [p.id as string, p]));

  const namesByCall = new Map<string, Attendee[]>();
  for (const row of marked ?? []) {
    const person = byId.get(row.client_id as string);
    if (!person) continue;
    const list = namesByCall.get(row.call_id as string) ?? [];
    list.push({ name: String(person.name ?? ""), email: (person.email as string) ?? null, source: "helm" });
    namesByCall.set(row.call_id as string, list);
  }

  return calls.map((c) => ({
    id: c.id as string,
    title: (c.title as string) ?? null,
    call_date: (c.call_date as string) ?? null,
    starts_at: (c.starts_at as string) ?? null,
    attended: typeof c.attended === "number" ? c.attended : null,
    names: namesByCall.get(c.id as string) ?? [],
  }));
}

export async function GET() {
  const [{ data, error }, helm] = await Promise.all([
    createLeadsAdminClient().from("client_calls").select("*").order("call_date", { ascending: false }).limit(200),
    helmGroupCalls(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const calls = (data ?? []).map((row) => ({
    ...row,
    attendance: resolveAttendance(row as Row, matchHelmCall(row as Row, helm)),
  }));
  return NextResponse.json({ calls });
}

// PATCH — the things Andrew marks by hand: recording sent, a reworded draft,
// a follow-up ticked off.
export async function PATCH(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { id?: string } & Record<string, unknown>;
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const allowed = ["recording_sent", "fam_draft", "mastermind_draft", "follow_ups", "summary", "title", "attendees", "attendee_count"];
  const clean: Record<string, unknown> = {};
  for (const k of allowed) if (k in b) clean[k] = b[k];

  // A headcount typed by a person is a fact. Reject one that is not a number,
  // rather than writing null and calling it zero.
  if ("attendee_count" in clean && clean.attendee_count !== null) {
    const n = Number(clean.attendee_count);
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: "attendee_count must be a number that is not negative" }, { status: 400 });
    clean.attendee_count = Math.floor(n);
  }
  if (b.recording_sent === true) clean.recording_sent_at = new Date().toISOString();
  if (b.recording_sent === false) clean.recording_sent_at = null;
  if (!Object.keys(clean).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const { data, error } = await createLeadsAdminClient()
    .from("client_calls").update(clean).eq("id", b.id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, call: data });
}
