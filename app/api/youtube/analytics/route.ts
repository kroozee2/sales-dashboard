import { NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { normalizeFreshUtcTimestamp } from "@/lib/composio-youtube";
import { normalizeStoredOwnerAnalytics } from "@/lib/youtube-owner-analytics";
import {
  YOUTUBE_CHANNEL,
  aggregateYouTubeDashboard,
  isExpectedYouTubeProfile,
  normalizePostedYouTubeRow,
  sortYouTubeVideos,
  withinYouTubeWindow,
} from "@/lib/youtube";

export const runtime = "nodejs";

export function buildYouTubeAnalyticsResponse(rows: Record<string, unknown>[], now = new Date(), ownerRows: Record<string, unknown>[] = []) {
  const ownerAnalytics = ownerRows
    .map((row) => normalizeStoredOwnerAnalytics(row.raw, now))
    .filter((value): value is NonNullable<typeof value> => value !== null)
    .sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt))
    .at(-1) ?? null;
  const youtubeRows = rows.filter((row) => row.platform === "youtube");
  if (youtubeRows.some((row) => {
    const raw = row.raw && typeof row.raw === "object" && !Array.isArray(row.raw) ? row.raw as Record<string, unknown> : null;
    if (raw?.provider === "composio") {
      return raw.channelId !== YOUTUBE_CHANNEL.id || raw.channelHandle !== YOUTUBE_CHANNEL.handle || !isExpectedYouTubeProfile(row.profile_url);
    }
    if (!raw || (!Object.hasOwn(raw, "channelId") && !Object.hasOwn(raw, "channelHandle"))) return false;
    return raw.channelId !== YOUTUBE_CHANNEL.id || raw.channelHandle !== YOUTUBE_CHANNEL.handle || !isExpectedYouTubeProfile(row.profile_url);
  })) {
    throw new Error("YouTube cache account mismatch");
  }
  const channelRows = youtubeRows.filter((row) => {
    const raw = row.raw && typeof row.raw === "object" && !Array.isArray(row.raw) ? row.raw as Record<string, unknown> : null;
    return raw?.channelId === YOUTUBE_CHANNEL.id && raw.channelHandle === YOUTUBE_CHANNEL.handle;
  });
  const composioSnapshots = new Map<string, { count: number; size: number; valid: boolean }>();
  for (const row of youtubeRows) {
    const raw = row.raw && typeof row.raw === "object" && !Array.isArray(row.raw) ? row.raw as Record<string, unknown> : null;
    const fetchedAt = raw?.provider === "composio" ? normalizeFreshUtcTimestamp(raw.fetchedAt, now) ?? "" : "";
    const snapshotSize = raw?.snapshotSize;
    if (!Number.isFinite(Date.parse(fetchedAt))) continue;
    const validSize = typeof snapshotSize === "number" && Number.isInteger(snapshotSize) && snapshotSize >= 1 && snapshotSize <= 500;
    const current = composioSnapshots.get(fetchedAt) ?? { count: 0, size: validSize ? snapshotSize : 0, valid: validSize };
    current.count += 1;
    current.valid = current.valid && validSize && current.size === snapshotSize;
    composioSnapshots.set(fetchedAt, current);
  }
  const latestComposioSnapshot = [...composioSnapshots]
    .filter(([, snapshot]) => snapshot.valid && snapshot.count === snapshot.size)
    .map(([fetchedAt]) => fetchedAt)
    .sort()
    .at(-1) ?? null;
  const hasComposioRows = youtubeRows.some((row) => {
    const raw = row.raw && typeof row.raw === "object" && !Array.isArray(row.raw) ? row.raw as Record<string, unknown> : null;
    return raw?.provider === "composio";
  });
  const snapshotRows = latestComposioSnapshot
    ? channelRows.filter((row) => {
      const raw = row.raw && typeof row.raw === "object" && !Array.isArray(row.raw) ? row.raw as Record<string, unknown> : null;
      return raw?.provider === "composio" && raw.fetchedAt === latestComposioSnapshot;
    })
    : hasComposioRows ? [] : channelRows;
  const videos = withinYouTubeWindow(
    snapshotRows.map(normalizePostedYouTubeRow).filter((row): row is NonNullable<typeof row> => row !== null),
    now,
  );
  const newestSync = snapshotRows
    .map((row) => {
      const raw = row.raw && typeof row.raw === "object" && !Array.isArray(row.raw) ? row.raw as Record<string, unknown> : null;
      return String(raw?.provider === "composio" ? raw.fetchedAt ?? "" : row.updated_at ?? row.created_at ?? "");
    })
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort()
    .at(-1) ?? null;
  const hasVerifiedSnapshot = videos.length > 0 && newestSync !== null;
  const providers = new Set(snapshotRows.flatMap((row) => {
    const raw = row.raw && typeof row.raw === "object" && !Array.isArray(row.raw) ? row.raw as Record<string, unknown> : null;
    return raw?.provider === "composio" ? ["composio"] : raw ? ["apify"] : [];
  }));
  const source = providers.has("composio")
    ? providers.has("apify") ? "Composio + Apify verified public snapshots" : "Composio YouTube Data API"
    : "Apify YouTube public channel snapshot";
  const start = new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);
  return {
    account: YOUTUBE_CHANNEL,
    dateRange: { start, end, label: "Past 365 days" },
    provenance: {
      source: hasVerifiedSnapshot ? source : "No verified YouTube snapshot",
      scope: hasVerifiedSnapshot ? "Public lifetime counters for uploads published in the selected period" : "Unavailable until the first verified channel sync completes",
      lastSyncedAt: newestSync,
      complete: false,
      note: ownerAnalytics
        ? "Authenticated owner metrics are date-bounded. Public video counters remain lifetime snapshots."
        : hasVerifiedSnapshot ? "Private YouTube Studio analytics are not connected. Public counters are cached snapshots." : "Run Sync YouTube to create the first verified public snapshot.",
    },
    capabilities: {
      publicMetrics: hasVerifiedSnapshot,
      privateAnalytics: ownerAnalytics !== null,
      unavailable: ownerAnalytics
        ? ["impressions", "impressionsCtr", "retention", "returningViewers", "uniqueViewers", "searchTerms"]
        : ["watchTime", "averageViewDuration", "averagePercentageViewed", "subscribersGained", "impressions", "impressionsCtr", "trafficSources"],
    },
    summary: aggregateYouTubeDashboard(videos),
    ownerAnalytics,
    videos: sortYouTubeVideos(videos, "recent"),
  };
}

export async function GET() {
  // Keep one extra day only for validating yesterday's complete snapshot.
  // buildYouTubeAnalyticsResponse still applies the exact rolling 365-day display window.
  const cutoff = new Date(Date.now() - 366 * 86_400_000).toISOString();
  const db = contentDb();
  const [publicResult, ownerResult] = await Promise.all([
    db.from("posted_content").select("*").eq("platform", "youtube").gte("posted_at", cutoff).limit(5_000).order("posted_at", { ascending: false }),
    db.from("posted_content").select("raw").eq("platform", "youtube_owner_analytics").limit(5).order("posted_at", { ascending: false }),
  ]);
  if (publicResult.error || ownerResult.error) return NextResponse.json({ error: "YouTube cache is temporarily unavailable" }, { status: 502 });
  try {
    return NextResponse.json(buildYouTubeAnalyticsResponse(
      (publicResult.data ?? []) as Record<string, unknown>[],
      new Date(),
      (ownerResult.data ?? []) as Record<string, unknown>[],
    ));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "YouTube analytics unavailable" }, { status: 409 });
  }
}
