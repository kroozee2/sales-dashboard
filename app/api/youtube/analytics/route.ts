import { NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import {
  YOUTUBE_CHANNEL,
  aggregateYouTubeDashboard,
  isExpectedYouTubeProfile,
  normalizePostedYouTubeRow,
  sortYouTubeVideos,
  withinYouTubeWindow,
} from "@/lib/youtube";

export const runtime = "nodejs";

export function buildYouTubeAnalyticsResponse(rows: Record<string, unknown>[], now = new Date()) {
  const youtubeRows = rows.filter((row) => row.platform === "youtube");
  if (youtubeRows.some((row) => !isExpectedYouTubeProfile(row.profile_url))) {
    throw new Error("YouTube cache account mismatch");
  }
  const channelRows = youtubeRows.filter((row) => {
    const raw = row.raw && typeof row.raw === "object" && !Array.isArray(row.raw) ? row.raw as Record<string, unknown> : null;
    return raw?.channelId === YOUTUBE_CHANNEL.id && raw.channelHandle === YOUTUBE_CHANNEL.handle;
  });
  const videos = withinYouTubeWindow(
    channelRows.map(normalizePostedYouTubeRow).filter((row): row is NonNullable<typeof row> => row !== null),
    now,
  );
  const newestSync = channelRows
    .map((row) => String(row.updated_at ?? row.created_at ?? ""))
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort()
    .at(-1) ?? null;
  const hasVerifiedSnapshot = videos.length > 0 && newestSync !== null;
  const start = new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);
  return {
    account: YOUTUBE_CHANNEL,
    dateRange: { start, end, label: "Past 365 days" },
    provenance: {
      source: hasVerifiedSnapshot ? "Apify YouTube public channel snapshot" : "No verified YouTube snapshot",
      scope: hasVerifiedSnapshot ? "Public lifetime counters for uploads published in the selected period" : "Unavailable until the first verified channel sync completes",
      lastSyncedAt: newestSync,
      complete: false,
      note: hasVerifiedSnapshot ? "Private YouTube Studio analytics are not connected. Public counters are cached snapshots." : "Run Sync YouTube to create the first verified public snapshot.",
    },
    capabilities: {
      publicMetrics: hasVerifiedSnapshot,
      privateAnalytics: false,
      unavailable: ["watchTime", "averageViewDuration", "averagePercentageViewed", "subscribersGained", "impressions", "impressionsCtr", "trafficSources"],
    },
    summary: aggregateYouTubeDashboard(videos),
    videos: sortYouTubeVideos(videos, "recent"),
  };
}

export async function GET() {
  const cutoff = new Date(Date.now() - 365 * 86_400_000).toISOString();
  const { data, error } = await contentDb()
    .from("posted_content")
    .select("*")
    .eq("platform", "youtube")
    .gte("posted_at", cutoff)
    .limit(5_000)
    .order("posted_at", { ascending: false });
  if (error) return NextResponse.json({ error: "YouTube cache is temporarily unavailable" }, { status: 502 });
  try {
    return NextResponse.json(buildYouTubeAnalyticsResponse((data ?? []) as Record<string, unknown>[]));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "YouTube analytics unavailable" }, { status: 409 });
  }
}
