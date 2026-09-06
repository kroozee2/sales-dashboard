import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);

const NUM_FIELDS = ["outreaches", "responses", "call_offers", "low_ticket_offers", "low_ticket_revenue", "total_revenue"] as const;

export async function GET() {
  const { data, error } = await db()
    .from("prospecting_log")
    .select("*")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const row: Record<string, unknown> = {
    entry_date: body.entry_date ?? new Date().toISOString().split("T")[0],
    person: body.person ?? "Andrew",
    notes: body.notes ?? null,
  };
  for (const f of NUM_FIELDS) row[f] = Number(body[f]) || 0;
  const { data, error } = await db().from("prospecting_log").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}

export async function PATCH(req: NextRequest) {
  const { id, ...fields } = await req.json() as { id: string } & Record<string, unknown>;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.entry_date !== undefined) updates.entry_date = fields.entry_date;
  if (fields.person !== undefined) updates.person = fields.person;
  if (fields.notes !== undefined) updates.notes = fields.notes;
  for (const f of NUM_FIELDS) if (fields[f] !== undefined) updates[f] = Number(fields[f]) || 0;
  const { data, error } = await db().from("prospecting_log").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await db().from("prospecting_log").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
