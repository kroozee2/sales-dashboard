import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import {
  blankScript,
  isScriptCategory,
  pickEditableScriptFields,
  seedFromIdea,
  seedFromModelPost,
  type ReelScript,
} from "@/lib/reel-scripts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reel scripts — the writable half of the Scripts tab.
 *
 * A script starts blank, from an idea already on the Ideas board, or from a
 * post we model. `contentDb` runs on the service key, which is what lets this
 * read reel_scripts at all: the table has RLS on with no policies, so the
 * published anon key sees nothing there.
 */

export async function GET() {
  const { data, error } = await contentDb()
    .from("reel_scripts")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Scripts are temporarily unavailable" }, { status: 502 });
  return NextResponse.json({ scripts: (data ?? []) as ReelScript[] });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }

  const from = typeof body.from === "string" ? body.from : "blank";
  const db = contentDb();

  let record: Record<string, unknown>;
  try {
    if (from === "idea") {
      const id = typeof body.id === "string" ? body.id : null;
      if (!id) return NextResponse.json({ error: "id is required to build from an idea" }, { status: 400 });
      const { data: idea, error } = await db
        .from("content_items").select("id, title, category, scheduled_date").eq("id", id).maybeSingle();
      if (error || !idea) return NextResponse.json({ error: "That idea no longer exists" }, { status: 404 });
      record = seedFromIdea({
        id: idea.id,
        title: idea.title ?? "Untitled idea",
        category: isScriptCategory(idea.category) ? idea.category : null,
        scheduled_date: idea.scheduled_date ?? null,
      });
    } else if (from === "model") {
      const id = typeof body.id === "string" ? body.id : null;
      if (!id) return NextResponse.json({ error: "id is required to build from a modelled post" }, { status: 400 });
      const { data: post, error } = await db
        .from("model_posts").select("id, handle, hook, theme, views, post_url").eq("id", id).maybeSingle();
      if (error || !post) return NextResponse.json({ error: "That post is no longer in the model set" }, { status: 404 });
      record = seedFromModelPost(post);
    } else {
      const title = typeof body.title === "string" ? body.title : "";
      const category = isScriptCategory(body.category) ? body.category : "value";
      record = blankScript(title, category);
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not build the script" }, { status: 400 });
  }

  const { data, error } = await db.from("reel_scripts").insert(record).select().single();
  if (error) return NextResponse.json({ error: "Could not create the script" }, { status: 500 });
  return NextResponse.json({ script: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }

  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  let update: Record<string, unknown>;
  try { update = pickEditableScriptFields(body); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid field" }, { status: 400 }); }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await contentDb()
    .from("reel_scripts").update(update).eq("id", id).select().maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save the change" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Script not found" }, { status: 404 });
  return NextResponse.json({ script: data });
}

export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await contentDb().from("reel_scripts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Could not remove the script" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
