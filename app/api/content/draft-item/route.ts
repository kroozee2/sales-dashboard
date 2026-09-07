import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { generateContentDrafts, eventContextOf, type Category, type Platform } from "@/lib/content";

export const runtime = "nodejs";
export const maxDuration = 300;

// Fill AI drafts on an existing calendar item using its title/category/platforms (+ linked event)
export async function POST(req: NextRequest) {
  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const db = contentDb();
  const { data: item, error } = await db.from("content_items").select("*").eq("id", id).single();
  if (error || !item) return NextResponse.json({ error: "item not found" }, { status: 404 });

  let eventContext: string | undefined;
  if (item.event_id) {
    const { data: ev } = await db.from("content_events").select("*").eq("id", item.event_id).single();
    if (ev) eventContext = eventContextOf(ev);
  }
  const platforms = (Array.isArray(item.platforms) ? item.platforms : []) as Platform[];
  if (!platforms.length) return NextResponse.json({ error: "item has no platforms" }, { status: 400 });

  try {
    // Prefer the creator's own headline/hook/details/CTA if they filled them in
    const m = (item.meta ?? {}) as Record<string, string>;
    const written = [
      m.headline && `Headline: ${m.headline}`,
      m.hook && `Hook: ${m.hook}`,
      m.details && `Details: ${m.details}`,
      m.cta && `Call to action: ${m.cta}`,
    ].filter(Boolean).join("\n");
    const topic = written || (m.topic as string) || item.title;
    const drafts = await generateContentDrafts({
      topic, category: (item.category as Category) ?? "value", platforms,
      reelFormat: item.meta?.reel_format as string | undefined, eventContext,
    });
    const merged = { ...(item.drafts || {}), ...drafts };
    const { data, error: upErr } = await db.from("content_items")
      .update({ drafts: merged, status: item.status === "idea" ? "drafted" : item.status, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ item: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "generation failed" }, { status: 500 });
  }
}
