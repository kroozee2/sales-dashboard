export type InstagramPostedRow = {
  platform: "instagram";
  profile_name: string;
  profile_url: string;
  post_url: string | null;
  external_id: string;
  text: string | null;
  posted_at: string | null;
  likes: number | null;
  comments: number | null;
  shares: number;
  reactions: number | null;
  views: number | null;
  media_type: string;
};

const IG_PROFILE = "https://www.instagram.com/kaptainkroeze/";

const metric = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export function mapInstagram(items: Record<string, unknown>[]): InstagramPostedRow[] {
  return items.map((post) => {
    const shortcode = (post.shortCode as string) || (post.shortcode as string) || "";
    const type = ((post.type as string) || (post.productType as string) || "").toLowerCase();
    return {
      platform: "instagram" as const,
      profile_name: (post.ownerUsername as string) ? `@${post.ownerUsername as string}` : "@kaptainkroeze",
      profile_url: IG_PROFILE,
      post_url: (post.url as string) || (shortcode ? `https://www.instagram.com/p/${shortcode}/` : null),
      external_id: (post.id as string) || shortcode,
      text: (post.caption as string) ?? null,
      posted_at: (post.timestamp as string) ?? null,
      likes: metric(post.likesCount),
      comments: metric(post.commentsCount),
      shares: 0,
      reactions: metric(post.likesCount),
      views: metric(post.videoPlayCount) ?? metric(post.videoViewCount),
      media_type: type.includes("video") || type.includes("reel") || type === "clips"
        ? "video"
        : type.includes("sidecar")
          ? "carousel"
          : "image",
    };
  }).filter((row) => row.external_id);
}
