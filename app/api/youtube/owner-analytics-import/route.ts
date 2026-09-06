import { NextRequest, NextResponse } from "next/server";
import { isHotLeadsAgent } from "@/lib/hot-leads-auth";
import { readBoundedRequestBody } from "@/lib/messaging";
import { contentDb } from "@/lib/supabase-content";
import { YOUTUBE_CHANNEL } from "@/lib/youtube";
import { normalizeOwnerAnalyticsImport } from "@/lib/youtube-owner-analytics";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 64_000;
const EXTERNAL_ID = `owner-analytics-${YOUTUBE_CHANNEL.id}`;

export async function POST(req: NextRequest) {
  if (!isHotLeadsAgent(req)) return NextResponse.json({ error: "Agent authorization required" }, { status: 401 });
  let payload: unknown;
  try {
    const text = await readBoundedRequestBody(req, MAX_BODY_BYTES);
    payload = JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: message === "Request body is too large" ? 413 : 400 });
  }

  let analytics;
  try {
    analytics = normalizeOwnerAnalyticsImport(payload);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid owner analytics" }, { status: 400 });
  }

  const row = {
    platform: "youtube_owner_analytics",
    profile_name: YOUTUBE_CHANNEL.name,
    profile_url: YOUTUBE_CHANNEL.url,
    post_url: YOUTUBE_CHANNEL.url,
    external_id: EXTERNAL_ID,
    text: "Authenticated owner analytics",
    posted_at: analytics.fetchedAt,
    likes: null,
    comments: null,
    shares: null,
    reactions: null,
    views: analytics.metrics.views,
    media_type: "analytics",
    media_url: null,
    raw: { provider: "youtube-analytics-api", metricBasis: "authenticated-period", ...analytics },
  };
  const { error } = await contentDb().from("posted_content").upsert(row, { onConflict: "external_id" });
  if (error) return NextResponse.json({ error: "Could not save owner YouTube Analytics" }, { status: 500 });
  return NextResponse.json({
    imported: true,
    channelId: analytics.channelId,
    dateRange: { start: analytics.startDate, end: analytics.endDate },
    metricCount: Object.keys(analytics.metrics).length,
    trafficSourceCount: analytics.trafficSources.length,
  });
}
