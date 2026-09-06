import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { generateProofContent } from "@/lib/content";

export const runtime = "nodejs";
export const maxDuration = 300;

const isVideo = (url?: string | null) => !!url && /\.(mp4|mov|m4v|webm|quicktime|avi|mkv)(\?|#|$)/i.test(url);

// GET — saved proof (migrated + generated)
export async function GET() {
  const { data } = await contentDb().from("content_proof").select("*").order("created_at", { ascending: false });
  return NextResponse.json({ proof: data ?? [] });
}

// POST — a client win and/or a screenshot/video. The media is saved to the proof
// bank FIRST, then enriched with AI best-effort. Saving never depends on the AI.
export async function POST(req: NextRequest) {
  const { win, image_url } = await req.json() as { win?: string; image_url?: string };
  if (!win?.trim() && !image_url) return NextResponse.json({ error: "win or media required" }, { status: 400 });

  const db = contentDb();
  const video = isVideo(image_url);

  // 1) Persist immediately so the proof can never be lost.
  const { data: saved, error: insErr } = await db.from("content_proof").insert({
    headline: win?.trim() ? null : video ? "🎥 Video proof" : "🖼️ Screenshot proof",
    one_liner: win?.trim() || null,
    image_url: image_url ?? null,
  }).select().single();
  if (insErr || !saved) return NextResponse.json({ error: insErr?.message ?? "Could not save proof" }, { status: 500 });

  // 2) Enrich with AI, best-effort. Vision only for images (Claude can't read video).
  //    Any failure here leaves the saved proof intact.
  try {
    const canGenerate = !!win?.trim() || !video; // typed win, or an image to analyze
    if (canGenerate) {
      const assets = await generateProofContent(win ?? "", video ? undefined : image_url);
      const { data: updated } = await db.from("content_proof").update({
        headline: assets.headline,
        proof_point: assets.proof_point,
        one_liner: assets.one_liner,
        story: assets.story,
        generated_assets: assets,
      }).eq("id", saved.id).select().single();
      return NextResponse.json({ item: updated ?? saved, assets, enriched: true });
    }
  } catch (e) {
    console.error("proof enrich failed (kept saved row):", e);
  }
  return NextResponse.json({ item: saved, enriched: false });
}

// PATCH — edit a saved proof (name/point/one-liner/story/media/source), or
// regenerate its ready-to-post assets in place when { regenerate: true }.
export async function PATCH(req: NextRequest) {
  const body = await req.json() as { id: string; regenerate?: boolean } & Record<string, unknown>;
  const { id, regenerate } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const db = contentDb();

  if (regenerate) {
    const { data: row } = await db.from("content_proof").select("*").eq("id", id).single();
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    const video = isVideo(row.image_url);
    const win = row.one_liner || row.headline || row.proof_point || "";
    if (!win.trim() && video) return NextResponse.json({ error: "Add a one-liner first — I can't read a video." }, { status: 400 });
    try {
      const assets = await generateProofContent(win, video ? undefined : row.image_url);
      const { data: updated } = await db.from("content_proof").update({
        headline: assets.headline, proof_point: assets.proof_point,
        one_liner: assets.one_liner, story: assets.story, generated_assets: assets,
      }).eq("id", id).select().single();
      return NextResponse.json({ item: updated, enriched: true });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "regenerate failed" }, { status: 500 });
    }
  }

  const allowed = ["headline", "proof_point", "one_liner", "story", "image_url", "source_url", "video_url", "person_name"];
  const clean: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) clean[k] = body[k];
  if (!Object.keys(clean).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  const { data, error } = await db.from("content_proof").update(clean).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await contentDb().from("content_proof").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
