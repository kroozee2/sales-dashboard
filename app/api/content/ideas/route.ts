import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { classifyIdea } from "@/lib/content";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const { data } = await contentDb().from("content_ideas").select("*").eq("status", "new").order("created_at", { ascending: false });
  return NextResponse.json({ ideas: data ?? [] });
}

// POST — capture a raw idea (text + optional screenshot), AI-classify, save
export async function POST(req: NextRequest) {
  const { text, image_url } = await req.json() as { text?: string; image_url?: string };
  if (!text?.trim() && !image_url) return NextResponse.json({ error: "text or image required" }, { status: 400 });
  let meta;
  try {
    meta = await classifyIdea(text ?? "", image_url);
  } catch {
    meta = { title: (text ?? "Idea").slice(0, 60), angle: "", category: "value", platforms: [], take: text ?? "", screenshot_summary: "" };
  }
  const { data, error } = await contentDb().from("content_ideas").insert({
    text: text ?? null, image_url: image_url ?? null,
    title: meta.title, angle: meta.angle, category: meta.category,
    platforms: meta.platforms, take: meta.take, screenshot_summary: meta.screenshot_summary,
    status: "new",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ idea: data });
}

export async function PATCH(req: NextRequest) {
  const { id, ...fields } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data, error } = await contentDb().from("content_ideas").update(fields).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ idea: data });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await contentDb().from("content_ideas").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
