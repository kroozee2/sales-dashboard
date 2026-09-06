import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";

export const runtime = "nodejs";

export async function GET() {
  const { data } = await contentDb().from("content_events").select("*").order("start_date", { ascending: true });
  return NextResponse.json({ events: data ?? [] });
}
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await contentDb().from("content_events").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}
export async function PATCH(req: NextRequest) {
  const { id, ...fields } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data, error } = await contentDb().from("content_events").update(fields).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await contentDb().from("content_events").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
