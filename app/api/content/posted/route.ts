import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import {
  FB_PROFILE, IG_PROFILE, runActorSync, mapFacebook, mapInstagram, mapYouTube, withinWindow, type Row,
} from "@/lib/posted-sources";

export const runtime = "nodejs";
export const maxDuration = 300;

const YT_HANDLE = "@andrewkroeze999";
const FB_ACTOR = "apify~facebook-posts-scraper";
const IG_ACTOR = "apify~instagram-scraper";
const YT_ACTOR = "lurkapi~youtube-channel-videos-stats-scraper";

// GET — everything we've posted, newest first.
export async function GET() {
  const { data, error } = await contentDb()
    .from("posted_content").select("*").order("posted_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posted: data ?? [] });
}

// POST — synchronous pull + upsert of one/all platforms. Kept for curl/backfill;
// the UI uses the async /sync-start + /sync-poll pair to dodge function timeouts.
// Pass { platform: "facebook" | "instagram" | "youtube" } to sync just one.
export async function POST(req: NextRequest) {
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN not configured" }, { status: 500 });
  const { days = 90, platform } = (await req.json().catch(() => ({}))) as { days?: number; platform?: string };
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const yearStart = `${new Date().getUTCFullYear()}-01-01`;

  const rows: Row[] = [];
  const errors: string[] = [];
  const only = (p: string) => !platform || platform === p;
  if (only("facebook")) {
    try { rows.push(...mapFacebook(await runActorSync(FB_ACTOR, { startUrls: [{ url: FB_PROFILE }], resultsLimit: 200, captionText: true, onlyPostsNewerThan: since }, token))); }
    catch (e) { errors.push(e instanceof Error ? e.message : "facebook failed"); }
  }
  if (only("instagram")) {
    try { rows.push(...mapInstagram(await runActorSync(IG_ACTOR, { directUrls: [IG_PROFILE], resultsType: "posts", resultsLimit: 200, onlyPostsNewerThan: since }, token))); }
    catch (e) { errors.push(e instanceof Error ? e.message : "instagram failed"); }
  }
  if (only("youtube")) {
    for (const ct of ["videos", "shorts"] as const) {
      try { rows.push(...mapYouTube(await runActorSync(YT_ACTOR, { channels: [YT_HANDLE], maxVideosPerChannel: 0, contentType: ct, sortBy: "newest", publishedAfter: yearStart, includeVideoStats: true }, token))); }
      catch (e) { errors.push(e instanceof Error ? e.message : `youtube ${ct} failed`); }
    }
  }

  const fresh = withinWindow(rows);
  if (fresh.length) {
    const { error } = await contentDb().from("posted_content").upsert(fresh, { onConflict: "external_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { data } = await contentDb().from("posted_content").select("*").order("posted_at", { ascending: false });
  return NextResponse.json({ posted: data ?? [], synced: fresh.length, errors: errors.length ? errors : undefined });
}
