import { NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import {
  aggregateInstagramMetrics,
  buildInstagramRecommendations,
  INSTAGRAM_CREDIT_GUARD,
  type InstagramPostedRow,
} from "@/lib/instagram-command";
import { IG_PROFILE } from "@/lib/posted-sources";

export const runtime = "nodejs";

export async function GET() {
  const coverageStart = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data, error } = await contentDb()
    .from("posted_content")
    .select("external_id,profile_name,profile_url,posted_at,media_type,views,likes,comments,shares,text,post_url")
    .eq("platform", "instagram")
    .eq("profile_url", IG_PROFILE)
    .gte("posted_at", coverageStart)
    .order("posted_at", { ascending: false })
    .limit(1000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const posts = (data ?? []) as InstagramPostedRow[];
  const truncated = posts.length === 1000;
  const accountMismatch = posts.some((post) => post.profile_url !== IG_PROFILE || (post.profile_name && post.profile_name.toLowerCase() !== "@kaptainkroeze"));
  if (accountMismatch) return NextResponse.json({ error: "Cached Instagram rows do not match @kaptainkroeze." }, { status: 409 });
  const windows = {
    7: aggregateInstagramMetrics(posts, 7),
    30: aggregateInstagramMetrics(posts, 30),
    90: aggregateInstagramMetrics(posts, 90),
  };

  return NextResponse.json({
    profile: {
      name: "Andrew Kroeze",
      handle: "@kaptainkroeze",
      url: IG_PROFILE,
      followers: null,
      followersNote: "Follower count is not available in the cached post dataset.",
    },
    windows,
    recommendations: {
      7: buildInstagramRecommendations(windows[7]),
      30: buildInstagramRecommendations(windows[30]),
      90: buildInstagramRecommendations(windows[90]),
    },
    freshness: {
      newestPostAt: posts[0]?.posted_at ?? null,
      source: "SalesOS posted_content cache",
      accountVerifiedBy: "profile_url + profile_name",
      automaticRefresh: false,
      coverageStart,
      truncated,
      coverageNote: truncated ? "Metrics include the newest 1,000 cached posts in the 90-day window." : "Metrics include all cached posts in the 90-day window.",
    },
    creditGuard: INSTAGRAM_CREDIT_GUARD,
  });
}
