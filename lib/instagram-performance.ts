export type InstagramPostedContent = {
  id: string;
  platform: string;
  post_url?: string | null;
  text?: string | null;
  posted_at?: string | null;
  likes?: number | null;
  comments?: number | null;
  views?: number | null;
  media_type?: string | null;
};

export type InstagramPerformanceRow = {
  id: string;
  postedAt: string;
  postUrl: string | null;
  name: string;
  description: string;
  hook: string;
  likes: number | null;
  comments: number | null;
  views: number | null;
  interactions: number | null;
  engagementRate: number | null;
  mediaType: string;
  performanceBasis: "views" | "interactions" | "unavailable";
  performanceLabel: string;
  performanceRank: number | null;
  performanceGroupSize: number;
};

const DAY_MS = 86_400_000;

const metricNumber = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export function extractInstagramHook(text: string | null | undefined): string {
  const lines = (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headline = lines.find((line) => !/^(comment|dm|message|reply|type)\b/i.test(line));
  if (headline) return headline;

  const cta = lines[0] ?? "";
  const topic = cta
    .replace(/^(comment|dm|message|reply|type)\b[\s\S]*?\b(?:to get|for)\s+/i, "")
    .replace(/[👇⬇️]+$/u, "")
    .trim();
  if (topic && !/^(?:the\s+)?(?:full\s+)?(?:step[- ]by[- ]step\s+)?(?:guide|details|invitation|trainings?|walk ?through)$/i.test(topic)) {
    return topic.charAt(0).toUpperCase() + topic.slice(1);
  }
  return "Hook/headline unavailable";
}

export function instagramPerformanceLabel(rank: number, count: number): string {
  return `#${rank} of ${count}`;
}

export function buildInstagramPerformanceBoard(
  posts: InstagramPostedContent[],
  now = new Date(),
): InstagramPerformanceRow[] {
  const cutoff = now.getTime() - 90 * DAY_MS;
  const current = posts
    .filter((post) => {
      if (post.platform !== "instagram" || !post.posted_at) return false;
      const postedAt = Date.parse(post.posted_at);
      return Number.isFinite(postedAt) && postedAt >= cutoff && postedAt <= now.getTime();
    })
    .map((post) => {
      const mediaType = post.media_type || "post";
      const rawViews = metricNumber(post.views);
      const views = mediaType !== "video" && rawViews === 0 ? null : rawViews;
      const likes = metricNumber(post.likes);
      const comments = metricNumber(post.comments);
      const interactions = likes === null && comments === null ? null : (likes ?? 0) + (comments ?? 0);
      const description = (post.text ?? "").trim();
      const hook = extractInstagramHook(description);
      const performanceBasis = views !== null
        ? "views" as const
        : interactions !== null
          ? "interactions" as const
          : "unavailable" as const;
      return {
        id: post.id,
        postedAt: post.posted_at as string,
        postUrl: post.post_url ?? null,
        name: hook,
        description: description || "Description unavailable",
        hook,
        likes,
        comments,
        views,
        interactions,
        engagementRate: views !== null && views > 0 && interactions !== null
          ? Number(((interactions / views) * 100).toFixed(2))
          : null,
        mediaType,
        performanceBasis,
      };
    });

  const ranks = new Map<string, { rank: number; count: number }>();
  for (const basis of ["views", "interactions"] as const) {
    const group = current.filter((post) => post.performanceBasis === basis);
    const metric = (post: (typeof current)[number]) => basis === "views" ? post.views ?? 0 : post.interactions ?? 0;
    group.forEach((post) => {
      const rank = 1 + group.filter((other) => metric(other) > metric(post)).length;
      ranks.set(post.id, { rank, count: group.length });
    });
  }

  return current
    .map((post) => {
      const rank = ranks.get(post.id);
      if (!rank) {
        return {
          ...post,
          performanceLabel: "Metrics unavailable",
          performanceRank: null,
          performanceGroupSize: 0,
        };
      }
      return {
        ...post,
        performanceLabel: instagramPerformanceLabel(rank.rank, rank.count),
        performanceRank: rank.rank,
        performanceGroupSize: rank.count,
      };
    })
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
}
