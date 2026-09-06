import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { generateContentDrafts, eventContextOf, type Category, type Platform } from "@/lib/content";

export const runtime = "nodejs";
export const maxDuration = 300;

// Generate drafts for a topic across platforms. Optionally save as a calendar item.
export async function POST(req: NextRequest) {
  const { topic, category, platforms, reelFormat, eventId, save, title, scheduled_date } = await req.json() as {
    topic: string; category: Category; platforms: Platform[]; reelFormat?: string;
    eventId?: string; save?: boolean; title?: string; scheduled_date?: string;
  };
  if (!topic?.trim() || !platforms?.length) {
    return NextResponse.json({ error: "topic and platforms required" }, { status: 400 });
  }

  let eventContext: string | undefined;
  if (eventId) {
    const { data: ev } = await contentDb().from("content_events").select("*").eq("id", eventId).single();
    if (ev) eventContext = eventContextOf(ev);
  }

  try {
    const drafts = await generateContentDrafts({ topic, category: category ?? "value", platforms, reelFormat, eventContext });
    if (save) {
      const { data, error } = await contentDb().from("content_items").insert({
        title: (title || topic).slice(0, 120),
        category: category ?? "value",
        status: "drafted",
        platforms,
        drafts,
        scheduled_date: scheduled_date || null,
        event_id: eventId || null,
        meta: reelFormat ? { reel_format: reelFormat, topic } : { topic },
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ drafts, item: data });
    }
    return NextResponse.json({ drafts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "generation failed" }, { status: 500 });
  }
}
