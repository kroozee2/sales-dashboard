import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);

// GET — fetch all manual payments
export async function GET() {
  const { data, error } = await db
    .from("manual_payments")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST — create new payment
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await db.from("manual_payments").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH — update existing payment
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...updates } = body;
  const { data, error } = await db.from("manual_payments").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — remove payment
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const { error } = await db.from("manual_payments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
