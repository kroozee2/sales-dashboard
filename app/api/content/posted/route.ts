import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { FB_PROFILE, runActorSync, mapFacebook, withinWindow, type Row } from "@/lib/posted-sources";

export const runtime = "nodejs";
export const maxDuration = 300;

const FB_ACTOR = "apify~facebook-posts-scraper";

// GET — everything we've posted, newest first.
export async function GET() {
  const { data, error } = await contentDb()
    .from("posted_content").select("*").order("posted_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posted: data ?? [] });
}

// POST — synchronous Facebook pull only. Instagram and YouTube use durable
// server-owned reservations through /sync-start + /sync-poll.
export async function POST(req: NextRequest) {
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN not configured" }, { status: 500 });
  const { days = 90, platform } = (await req.json().catch(() => ({}))) as { days?: number; platform?: string };
  if (!platform || platform === "instagram") {
    return NextResponse.json({ error: "Instagram sync must use the reserved async sync endpoint" }, { status: 409 });
  }
  if (platform === "youtube") {
    return NextResponse.json({ error: "YouTube sync must use the reserved async sync endpoint" }, { status: 409 });
  }
  if (platform !== "facebook") return NextResponse.json({ error: "valid platform required" }, { status: 400 });
  if (!Number.isInteger(days) || days < 1 || days > 365) return NextResponse.json({ error: "days must be an integer from 1 to 365" }, { status: 400 });
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);


  const rows: Row[] = [];
  const errors: string[] = [];
  if (platform === "facebook") {
    try { rows.push(...mapFacebook(await runActorSync(FB_ACTOR, { startUrls: [{ url: FB_PROFILE }], resultsLimit: 200, captionText: true, onlyPostsNewerThan: since }, token))); }
    catch (e) { errors.push(e instanceof Error ? e.message : "facebook failed"); }
  }


  const fresh = withinWindow(rows);
  if (fresh.length) {
    const { error } = await contentDb().from("posted_content").upsert(fresh, { onConflict: "external_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { data } = await contentDb().from("posted_content").select("*").order("posted_at", { ascending: false });
  return NextResponse.json({ posted: data ?? [], synced: fresh.length, errors: errors.length ? errors : undefined });
}
