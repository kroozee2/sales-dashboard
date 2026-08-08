import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";

export const runtime = "nodejs";

// GET — saved graphics library (newest first)
export async function GET() {
  const { data } = await contentDb().from("content_graphics").select("*").order("created_at", { ascending: false });
  return NextResponse.json({ graphics: data ?? [] });
}

// POST — save a generated graphic to the library
export async function POST(req: NextRequest) {
  const { title, image_url, spec, format } = (await req.json()) as { title?: string; image_url?: string; spec?: string; format?: string };
  if (!image_url) return NextResponse.json({ error: "image_url required" }, { status: 400 });
  const { data, error } = await contentDb().from("content_graphics")
    .insert({ title: title ?? "Graphic", image_url, spec: spec ?? null, format: format ?? null })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, graphic: data });
}

// DELETE — remove a saved graphic (?id=…)
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await contentDb().from("content_graphics").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
