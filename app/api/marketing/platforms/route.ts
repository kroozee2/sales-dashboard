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

const RANGE_DAYS = { week: 7, month: 30, quarter: 90, year: 365, all: 36500 } as const;
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
  // All time by default: it is the only window with a number for every
  // platform today, so opening on it shows a full board rather than four dashes.
  const range = (req.nextUrl.searchParams.get("range") ?? "all") as Range;
  const days = RANGE_DAYS[range] ?? 30;
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const db = createLeadsAdminClient();

  // YouTube reports its own subscriber movement, which is real history the
  // snapshots cannot reach back to. It covers one stored window (365 days), so
  // it answers Year and All time and nothing shorter.
  let youtubeNet: { value: number; gained: number; lost: number; from: string; to: string } | null = null;
  try {
    // Stored as a row in posted_content under its own platform key — it is the
    // analytics blob, not a post, which is why the posts views exclude it.
    const { data: ownerRows } = await db
      .from("posted_content").select("raw").eq("platform", "youtube_owner_analytics")
      .order("posted_at", { ascending: false }).limit(1);
    const raw = (ownerRows ?? [])[0]?.raw as Record<string, unknown> | undefined;
    const m = raw?.metrics as Record<string, number> | undefined;
    if (m && typeof m.subscribersNet === "number") {
      youtubeNet = {
        value: m.subscribersNet,
        gained: m.subscribersGained ?? 0,
        lost: m.subscribersLost ?? 0,
        from: String(raw?.startDate ?? ""),
        to: String(raw?.endDate ?? ""),
      };
    }
  } catch { /* the board still works without it */ }

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
    // Two readings make a change; one is just today's number.
    const snapshotChange = first && last && first.followers != null && last.followers != null && mine.length > 1
      ? last.followers - first.followers : null;
    // YouTube's own figure fills the long windows the snapshots cannot yet reach.
    const useYoutube = p.key === "youtube" && snapshotChange === null && youtubeNet && (range === "all" || range === "year");
    const change = snapshotChange ?? (useYoutube ? youtubeNet!.value : null);
    const basis = snapshotChange !== null ? "snapshots" : useYoutube ? "youtube-analytics" : null;
    const detail = useYoutube ? `+${youtubeNet!.gained} gained · ${youtubeNet!.lost} lost since ${youtubeNet!.from}` : null;
    return {
      ...p,
      followers: latest?.followers ?? null,
      posts: latest?.posts ?? null,
      total_views: latest?.total_views ?? null,
      captured_on: latest?.captured_on ?? null,
      change,
      basis,
      detail,
      // A single point is a reading, not a trend; the UI says so.
      series: mine.map((r) => ({ date: r.captured_on, followers: r.followers })),
    };
  });

  const audience = platforms.reduce((s, p) => s + (p.followers ?? 0), 0);
  const dates = [...new Set(rows.map((r) => r.captured_on))].sort();

  // Month-by-month, per platform. Follower counts only start when snapshots do,
  // but what was published and how it did goes back as far as the posts, so the
  // table has real history from day one instead of waiting on the snapshots.
  const months = Math.min(24, Math.max(3, Math.round(days / 30)));
  const monthKeys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const { data: postRows } = await db
    .from("posted_content")
    .select("platform, posted_at, views, likes, comments, shares")
    .not("posted_at", "is", null)
    .gte("posted_at", `${monthKeys[0]}-01`);

  // Followers at the end of each month, from whatever snapshots exist.
  const { data: snapRows } = await db
    .from(TABLE).select("platform, followers, captured_on").order("captured_on", { ascending: true });

  const monthly = monthKeys.map((key) => {
    const perPlatform = PLATFORMS.map((p) => {
      const posts = (postRows ?? []).filter(
        (r) => r.platform === p.key && String(r.posted_at).slice(0, 7) === key,
      );
      const views = posts.reduce((s, r) => s + (r.views ?? 0), 0);
      const engagement = posts.reduce(
        (s, r) => s + (r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0), 0,
      );
      const inMonth = (snapRows ?? []).filter((r) => r.platform === p.key && String(r.captured_on).slice(0, 7) === key);
      const endFollowers = inMonth.length ? inMonth[inMonth.length - 1].followers : null;
      const startFollowers = inMonth.length ? inMonth[0].followers : null;
      return {
        platform: p.key,
        posts: posts.length,
        views,
        engagement,
        avg_views: posts.length ? Math.round(views / posts.length) : 0,
        followers: endFollowers,
        followers_change: endFollowers != null && startFollowers != null && inMonth.length > 1
          ? endFollowers - startFollowers : null,
      };
    });
    return {
      month: key,
      label: new Date(`${key}-01T12:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      platforms: perPlatform,
      totals: {
        posts: perPlatform.reduce((s, x) => s + x.posts, 0),
        views: perPlatform.reduce((s, x) => s + x.views, 0),
        engagement: perPlatform.reduce((s, x) => s + x.engagement, 0),
      },
    };
  })
    // All time spans further back than there is content, which padded the table
    // with a year of zero rows. Start at the first month that actually has any.
    .filter((m, i, all) => {
      const firstWithData = all.findIndex((x) => x.totals.posts > 0);
      return firstWithData === -1 ? i >= all.length - 6 : i >= firstWithData;
    })
    .reverse();

  return NextResponse.json({
    range,
    platforms,
    monthly,
    totals: {
      audience,
      change: platforms.reduce((s, p) => s + (p.change ?? 0), 0),
      tracking_since: dates[0] ?? null,
      days_of_history: dates.length,
    },
  });
}

// ── Capture today's numbers ─────────────────────────────────────────────────
// Exported so the daily cron runs exactly what the button runs, rather than a
// second copy that can drift.
export async function captureSnapshot() {
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
    return { ok: false as const, status: 502, body: { error: "Could not read any platform.", failures } };
  }

  const today = new Date().toISOString().slice(0, 10);
  const db = createLeadsAdminClient();
  const { error } = await db.from(TABLE).upsert(
    captured.map((c) => ({ ...c, captured_on: today, captured_at: new Date().toISOString() })),
    { onConflict: "platform,captured_on" },
  );
  if (error) return { ok: false as const, status: 500, body: { error: error.message } };

  return { ok: true as const, status: 200, body: { ok: true, captured: captured.length, platforms: captured, failures } };
}

export async function POST() {
  const result = await captureSnapshot();
  return NextResponse.json(result.body, { status: result.status });
}
