import { NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import {
  channelSummary, pickOutliers, scoreChannel,
  type Competitor, type CompetitorVideo,
} from "@/lib/youtube-research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The research board, read from our own rows.
 *
 * Scraping three channels takes minutes, so the page never does it on load —
 * it reads the last sync and says how old it is. Sync is a separate, explicit
 * button.
 */
export async function GET() {
  const db = contentDb();

  const { data: channels, error } = await db
    .from("yt_competitors")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "Competitor research is temporarily unavailable" }, { status: 502 });
  }

  const competitors = (channels ?? []) as Competitor[];
  if (!competitors.length) return NextResponse.json({ competitors: [], videos: [], outliers: [] });

  const { data: rows } = await db
    .from("yt_competitor_videos")
    .select("competitor_id,video_id,title,url,thumbnail_url,view_count,likes,published_at,is_short")
    .in("competitor_id", competitors.map((c) => c.id))
    .order("published_at", { ascending: false, nullsFirst: false });

  const byChannel = new Map<string, CompetitorVideo[]>();
  for (const row of (rows ?? []) as (CompetitorVideo & { competitor_id: string })[]) {
    const list = byChannel.get(row.competitor_id) ?? [];
    list.push(row);
    byChannel.set(row.competitor_id, list);
  }

  const now = new Date();
  const enriched = competitors.map((competitor) => {
    const videos = byChannel.get(competitor.id) ?? [];
    const scored = scoreChannel(competitor, videos, now);
    return {
      ...competitor,
      summary: channelSummary(videos, now),
      videos: scored,
      outliers: pickOutliers(scored, 1.5, 6),
    };
  });

  // One cross-channel list, so "what should I model this week" is one glance
  // rather than three. Ranked by how far each video beat its own channel.
  const allOutliers = enriched
    .flatMap((c) => c.outliers)
    .sort((a, b) => (b.multiple ?? 0) - (a.multiple ?? 0))
    .slice(0, 18);

  return NextResponse.json({ competitors: enriched, outliers: allOutliers });
}
