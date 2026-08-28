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
  likes: number;
  comments: number;
  views: number;
  interactions: number;
  engagementRate: number | null;
  mediaType: string;
  performanceBasis: "views" | "interactions";
  performanceLabel: string;
  performanceRank: number;
  performanceGroupSize: number;
};

const DAY_MS = 86_400_000;

const cleanNumber = (value: number | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export function extractInstagramHook(text: string | null | undefined): string {
  const firstLine = (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine || "Hook unavailable";
}

export function instagramPerformanceLabel(rank: number, count: number): string {
  if (rank <= 1) return "Top performer";
  if (rank <= Math.ceil(count * 0.25)) return "Top 25%";
  if (rank <= Math.ceil(count * 0.5)) return "Above average";
  return "Below average";
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
      const views = cleanNumber(post.views);
      const likes = cleanNumber(post.likes);
      const comments = cleanNumber(post.comments);
      const interactions = likes + comments;
      const description = (post.text ?? "").trim();
      const hook = extractInstagramHook(description);
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
        engagementRate: views > 0 ? Number(((interactions / views) * 100).toFixed(2)) : null,
        mediaType: post.media_type || "post",
        performanceBasis: views > 0 ? "views" as const : "interactions" as const,
      };
    });

  const ranks = new Map<string, { rank: number; count: number }>();
  for (const basis of ["views", "interactions"] as const) {
    const group = current
      .filter((post) => post.performanceBasis === basis)
      .sort((a, b) => {
        const primary = basis === "views" ? b.views - a.views : b.interactions - a.interactions;
        return primary || b.interactions - a.interactions || Date.parse(b.postedAt) - Date.parse(a.postedAt);
      });
    group.forEach((post, index) => ranks.set(post.id, { rank: index + 1, count: group.length }));
  }

  return current
    .map((post) => {
      const rank = ranks.get(post.id) ?? { rank: 1, count: 1 };
      return {
        ...post,
        performanceLabel: instagramPerformanceLabel(rank.rank, rank.count),
        performanceRank: rank.rank,
        performanceGroupSize: rank.count,
      };
    })
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
}
