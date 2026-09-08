import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

// Audience size across the platforms, and how it has moved.
//
// Nothing recorded follower counts before marketing_snapshots existed, so the
// growth series starts the day this shipped and fills in from there. That is
// stated in the response rather than smoothed over with invented history —
// a made-up trend line is worse than an honest empty one.
//
// GET  reads the stored series (fast, no third-party calls).
// POST captures today's numbers from Instagram, Facebook and YouTube.

export const runtime = "nodejs";
export const maxDuration = 300;

const APIFY = "https://api.apify.com/v2/acts";
const TABLE = "marketing_snapshots";

export type PlatformKey = "instagram" | "youtube" | "facebook" | "skool";

const PLATFORMS: { key: PlatformKey; label: string; emoji: string; unit: string; handle: string | null }[] = [
  { key: "instagram", label: "Instagram", emoji: "📸", unit: "followers", handle: "@kaptainkroeze" },
  { key: "youtube", label: "YouTube", emoji: "▶️", unit: "subscribers", handle: "@andrewkroeze999" },
  { key: "facebook", label: "Facebook", emoji: "👍", unit: "followers", handle: "andrew.kroeze.50" },
  { key: "skool", label: "Skool", emoji: "🎓", unit: "members", handle: null },
];

const RANGE_DAYS = { week: 7, month: 30, quarter: 90, year: 365 } as const;
type Range = keyof typeof RANGE_DAYS;

async function apify(actor: string, input: unknown): Promise<Record<string, unknown>[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not set");
  const res = await fetch(`${APIFY}/${actor}/run-sync-get-dataset-items?token=${token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${actor} returned ${res.status}`);
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

// ── GET: current numbers + the series behind them ───────────────────────────
export async function GET(req: NextRequest) {
  const range = (req.nextUrl.searchParams.get("range") ?? "month") as Range;
  const days = RANGE_DAYS[range] ?? 30;
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const db = createLeadsAdminClient();
  const { data, error } = await db
    .from(TABLE)
    .select("platform, followers, posts, total_views, captured_on")
    .gte("captured_on", since)
    .order("captured_on", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const { data: latestAll } = await db
    .from(TABLE).select("platform, followers, posts, total_views, captured_on, source")
    .order("captured_on", { ascending: false }).limit(40);

  const platforms = PLATFORMS.map((p) => {
    const mine = rows.filter((r) => r.platform === p.key);
    const latest = (latestAll ?? []).find((r) => r.platform === p.key) ?? null;
    const first = mine[0] ?? null;
    const last = mine[mine.length - 1] ?? null;
    const change = first && last && first.followers != null && last.followers != null
      ? last.followers - first.followers : null;
    return {
      ...p,
      followers: latest?.followers ?? null,
      posts: latest?.posts ?? null,
      total_views: latest?.total_views ?? null,
      captured_on: latest?.captured_on ?? null,
      change,
      // A single point is a reading, not a trend; the UI says so.
      series: mine.map((r) => ({ date: r.captured_on, followers: r.followers })),
    };
  });

  const audience = platforms.reduce((s, p) => s + (p.followers ?? 0), 0);
  const dates = [...new Set(rows.map((r) => r.captured_on))].sort();

  return NextResponse.json({
    range,
    platforms,
    totals: {
      audience,
      change: platforms.reduce((s, p) => s + (p.change ?? 0), 0),
      tracking_since: dates[0] ?? null,
      days_of_history: dates.length,
    },
  });
}

// ── POST: capture today's numbers ───────────────────────────────────────────
export async function POST() {
  const captured: Record<string, unknown>[] = [];
  const failures: { platform: string; reason: string }[] = [];

  const tasks: [PlatformKey, () => Promise<Record<string, unknown>>][] = [
    ["instagram", async () => {
      const [p] = await apify("apify~instagram-profile-scraper", { usernames: ["kaptainkroeze"] });
      if (!p) throw new Error("no profile returned");
      return { followers: p.followersCount as number, posts: p.postsCount as number, source: "apify/instagram-profile-scraper" };
    }],
    ["facebook", async () => {
      const [p] = await apify("apify~facebook-pages-scraper", { startUrls: [{ url: "https://www.facebook.com/andrew.kroeze.50" }] });
      if (!p) throw new Error("no page returned");
      return { followers: (p.followers ?? p.likes) as number, source: "apify/facebook-pages-scraper" };
    }],
    ["youtube", async () => {
      const [c] = await apify("streamers~youtube-scraper", {
        startUrls: [{ url: "https://www.youtube.com/@andrewkroeze999" }],
        maxResults: 1, maxResultsShorts: 0, maxResultStreams: 0,
      });
      if (!c) throw new Error("no channel returned");
      return {
        followers: c.numberOfSubscribers as number,
        posts: c.channelTotalVideos as number,
        total_views: c.channelTotalViews as number,
        source: "apify/youtube-scraper",
      };
    }],
  ];

  const results = await Promise.allSettled(tasks.map(([, run]) => run()));
  results.forEach((r, i) => {
    const platform = tasks[i][0];
    if (r.status === "fulfilled") captured.push({ platform, ...r.value });
    // Name the platform that failed, so a gap in the chart is explainable.
    else failures.push({ platform, reason: r.reason instanceof Error ? r.reason.message : String(r.reason) });
  });

  if (captured.length === 0) {
    return NextResponse.json({ error: "Could not read any platform.", failures }, { status: 502 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const db = createLeadsAdminClient();
  const { error } = await db.from(TABLE).upsert(
    captured.map((c) => ({ ...c, captured_on: today, captured_at: new Date().toISOString() })),
    { onConflict: "platform,captured_on" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, captured: captured.length, platforms: captured, failures });
}
