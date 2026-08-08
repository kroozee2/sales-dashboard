import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";

export const runtime = "nodejs";

// GET — logged story posts, newest first
export async function GET() {
  const { data } = await contentDb().from("content_stories").select("*").order("posted_date", { ascending: false }).order("created_at", { ascending: false });
  return NextResponse.json({ stories: data ?? [] });
}

// POST — log a story: a photo, which platforms it went on, and the date posted
export async function POST(req: NextRequest) {
  const { image_url, platforms, posted_date, note } = await req.json() as { image_url?: string; platforms?: string[]; posted_date?: string; note?: string };
  if (!image_url) return NextResponse.json({ error: "image required" }, { status: 400 });
  const { data, error } = await contentDb().from("content_stories").insert({
    image_url,
    platforms: Array.isArray(platforms) ? platforms : [],
    posted_date: posted_date || new Date().toISOString().slice(0, 10),
    note: note?.trim() || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ story: data });
}

// PATCH — edit platforms / date / note
export async function PATCH(req: NextRequest) {
  const { id, ...fields } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data, error } = await contentDb().from("content_stories").update(fields).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ story: data });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await contentDb().from("content_stories").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
