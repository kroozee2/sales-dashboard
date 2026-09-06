import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { generateContentDrafts, type Category, type Platform } from "@/lib/content";

export const runtime = "nodejs";
export const maxDuration = 300;

// Idea → drafted calendar item (generates drafts for the idea's platforms)
export async function POST(req: NextRequest) {
  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const db = contentDb();
  const { data: idea, error } = await db.from("content_ideas").select("*").eq("id", id).single();
  if (error || !idea) return NextResponse.json({ error: "idea not found" }, { status: 404 });

  const platforms = ((Array.isArray(idea.platforms) && idea.platforms.length ? idea.platforms : ["instagram"]) as Platform[]);
  const topic = idea.take || idea.text || idea.title;
  try {
    const drafts = await generateContentDrafts({ topic, category: (idea.category as Category) ?? "value", platforms });
    const { data: item, error: insErr } = await db.from("content_items").insert({
      title: (idea.title || topic).slice(0, 120),
      category: idea.category ?? "value",
      status: "drafted",
      platforms, drafts,
      meta: { topic, from_idea: id },
    }).select().single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    await db.from("content_ideas").update({ status: "sent", content_item_id: item.id }).eq("id", id);
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "convert failed" }, { status: 500 });
  }
}
