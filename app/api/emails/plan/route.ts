import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

// The plan: what is going out, and when. GoHighLevel owns the sending; this
// owns the intent, which GHL has nowhere to put. A row starts as an idea after
// a video goes up or a promo is agreed, and ends matched to the real send.
//
// Nothing here sends an email. The app has no ability to, by design.

export const runtime = "nodejs";

const FIELDS = [
  "title", "subject", "planned_date", "status", "kind",
  "audience", "notes", "link_url", "ghl_schedule_id", "opens", "clicks",
] as const;

const STATUSES = ["idea", "drafted", "scheduled", "sent", "skipped"];
const KINDS = ["youtube", "promo", "launch", "nurture", "newsletter"];

function clean(body: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const k of FIELDS) {
    if (!(k in body)) continue;
    let v = body[k];
    if (v === "") v = null;
    if ((k === "opens" || k === "clicks") && v !== null) {
      const n = Number(v);
      v = Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    }
    row[k] = v;
  }
  if (typeof row.status === "string" && !STATUSES.includes(row.status)) delete row.status;
  if (typeof row.kind === "string" && !KINDS.includes(row.kind)) delete row.kind;
  return row;
}

export async function GET() {
  const { data, error } = await createLeadsAdminClient()
    .from("email_plan").select("*").order("planned_date", { ascending: true, nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body.title || String(body.title).trim() === "") {
    return NextResponse.json({ error: "Give it a title." }, { status: 400 });
  }
  const { data, error } = await createLeadsAdminClient()
    .from("email_plan").insert(clean(body)).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const { data, error } = await createLeadsAdminClient()
    .from("email_plan")
    .update({ ...clean(body), updated_at: new Date().toISOString() })
    .eq("id", body.id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const { error } = await createLeadsAdminClient().from("email_plan").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
