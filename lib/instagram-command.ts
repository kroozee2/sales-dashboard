export const INSTAGRAM_CREDIT_GUARD = {
  profileCooldownHours: 24,
  competitorCacheDays: 7,
  maxSamplePosts: 20,
  maxEvidencePosts: 8,
} as const;

const INSTAGRAM_CONTENT_PLATFORMS = new Set(["instagram", "instagram_post", "carousel"]);
export function isInstagramContentPlatform(platforms: unknown): boolean {
  return Array.isArray(platforms) && platforms.some((platform) => typeof platform === "string" && INSTAGRAM_CONTENT_PLATFORMS.has(platform));
}

export type InstagramPostedRow = {
  external_id: string;
  profile_name?: string;
  profile_url?: string;
  posted_at: string | null;
  media_type: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  text: string | null;
  post_url: string | null;
};

const number = (value: unknown) => Number(value ?? 0) || 0;

export function aggregateInstagramMetrics(rows: InstagramPostedRow[], days: 7 | 30 | 90, now = new Date()) {
  const cutoff = now.getTime() - days * 86_400_000;
  const selected = rows
    .filter((row) => row.posted_at && Date.parse(row.posted_at) >= cutoff && Date.parse(row.posted_at) <= now.getTime())
    .map((row) => ({ ...row, views: number(row.views), likes: number(row.likes), comments: number(row.comments), shares: number(row.shares) }));
  const totals = selected.reduce((sum, row) => ({
    views: sum.views + row.views,
    likes: sum.likes + row.likes,
    comments: sum.comments + row.comments,
    shares: sum.shares + row.shares,
  }), { views: 0, likes: 0, comments: 0, shares: 0 });
  const viewKnown = selected.filter((row) => row.views > 0);
  const knownViews = viewKnown.reduce((sum, row) => sum + row.views, 0);
  const knownEngagements = viewKnown.reduce((sum, row) => sum + row.likes + row.comments + row.shares, 0);
  const formatMix = { reels: 0, carousels: 0, images: 0 };
  for (const row of selected) {
    const type = (row.media_type || "").toLowerCase();
    if (type.includes("video") || type.includes("reel")) formatMix.reels += 1;
    else if (type.includes("carousel") || type.includes("sidecar")) formatMix.carousels += 1;
    else formatMix.images += 1;
  }
  const topPosts = [...selected].sort((a, b) => {
    const score = (row: typeof a) => row.views + (row.likes + row.comments * 2 + row.shares * 3) * 10;
    return score(b) - score(a) || Date.parse(b.posted_at || "") - Date.parse(a.posted_at || "");
  }).slice(0, 6).map((row) => ({
    ...row,
    text: row.text?.slice(0, 500) || null,
    post_url: normalizeInstagramPostUrl(row.post_url),
  }));
  return {
    days,
    posts: selected.length,
    ...totals,
    averageViews: viewKnown.length ? Math.round(knownViews / viewKnown.length) : null,
    engagementRate: knownViews ? Number(((knownEngagements / knownViews) * 100).toFixed(2)) : null,
    formatMix,
    topPosts,
    newestPostedAt: selected[0]?.posted_at ?? null,
  };
}

export function buildInstagramRecommendations(metrics: ReturnType<typeof aggregateInstagramMetrics>): string[] {
  if (!metrics.posts) return ["No cached posts in this window. Use manual Sync when you are ready to spend Apify credits."];
  const results: string[] = [];
  if (metrics.formatMix.carousels === 0) results.push("No carousels in this window. Test one save-focused carousel this week.");
  if (metrics.formatMix.reels === 0) results.push("No Reels in this window. Add one direct-to-camera Reel with a specific outcome hook.");
  const top = metrics.topPosts[0];
  if (top) results.push(`Your strongest cached post had ${top.views.toLocaleString()} views and ${top.comments.toLocaleString()} comments. Reuse its hook mechanism, not its wording.`);
  if (metrics.comments > metrics.likes * 0.35) results.push("Comment activity is strong relative to likes. Keep using clear keyword CTAs when the promised asset is ready.");
  else results.push("Comments trail likes. Test a lower-friction question or keyword CTA on the next post.");
  return results.slice(0, 3);
}

export function normalizeInstagramProfileUrl(value: string): string | null {
  const raw = value.trim();
  const handle = raw.startsWith("@") ? raw.slice(1) : raw;
  if (/^[A-Za-z0-9._]{1,30}$/.test(handle)) return `https://www.instagram.com/${handle}/`;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase())) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 1 || ["p", "reel", "reels", "stories", "explore"].includes(parts[0].toLowerCase())) return null;
    if (!/^[A-Za-z0-9._]{1,30}$/.test(parts[0])) return null;
    return `https://www.instagram.com/${parts[0]}/`;
  } catch { return null; }
}

export function normalizeInstagramPostUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase())) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2 || !["p", "reel"].includes(parts[0].toLowerCase()) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
    return `https://www.instagram.com/${parts[0].toLowerCase()}/${parts[1]}/`;
  } catch { return null; }
}

export function strictDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function syncEligibility(lastSync: string | null | undefined, kind: "profile" | "competitor", now = new Date()) {
  const cooldownMs = (kind === "profile" ? INSTAGRAM_CREDIT_GUARD.profileCooldownHours / 24 : INSTAGRAM_CREDIT_GUARD.competitorCacheDays) * 86_400_000;
  const last = lastSync ? Date.parse(lastSync) : NaN;
  const nextEligibleAt = Number.isFinite(last) ? new Date(last + cooldownMs).toISOString() : null;
  return { eligible: !Number.isFinite(last) || now.getTime() >= last + cooldownMs, nextEligibleAt };
}

export function extractCompetitorProfileStats(items: Record<string, unknown>[], expectedHandle: string) {
  const expected = expectedHandle.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(expected)) return { handle: null, followers: null };
  let matched = false;
  for (const item of items) {
    const handleValue = item.ownerUsername ?? item.username;
    const handle = typeof handleValue === "string" && /^[A-Za-z0-9._]{1,30}$/.test(handleValue) ? handleValue.toLowerCase() : null;
    if (handle !== expected) continue;
    matched = true;
    const followerValue = item.ownerFollowersCount ?? item.followersCount;
    if (followerValue === null || followerValue === undefined || followerValue === "") continue;
    const followers = Number(followerValue);
    if (Number.isFinite(followers) && Number.isInteger(followers) && followers >= 0) return { handle: expected, followers };
  }
  return { handle: matched ? expected : null, followers: null };
}

export function competitorPostMetric(post: { views?: number | null; plays?: number | null }) {
  const views = Number(post.views || 0);
  if (views > 0) return { value: views, label: "views" as const };
  const plays = Number(post.plays || 0);
  if (plays > 0) return { value: plays, label: "plays" as const };
  return { value: null, label: "unavailable" as const };
}

export function averageCompetitorViews(posts: Array<{ views?: number | null }>) {
  const known = posts.map((post) => Number(post.views || 0)).filter((views) => views > 0);
  return known.length ? Math.round(known.reduce((sum, views) => sum + views, 0) / known.length) : null;
}

function extractEvidenceCopy(caption: string) {
  const segments = caption.split(/\r?\n|(?<=[.!?])\s+/).map((segment) => segment.trim()).filter(Boolean);
  const hook = (segments[0] || "").slice(0, 280);
  let ctaIndex = -1;
  for (let index = segments.length - 1; index >= 0; index--) {
    if (/\b(comment|dm|message|follow|save|share|click|link|book|join|download|reply)\b/i.test(segments[index])) {
      ctaIndex = index;
      break;
    }
  }
  const cta = ctaIndex >= 0 ? segments[ctaIndex].slice(0, 280) : "";
  const description = segments.filter((_, index) => index !== 0 && index !== ctaIndex).join(" ").slice(0, 500);
  const title = hook.slice(0, 120);
  return { title, hook, description, cta };
}

export function mapCompetitorEvidence(items: Record<string, unknown>[]) {
  const number = (value: unknown) => Number(value ?? 0) || 0;
  return items.slice(0, INSTAGRAM_CREDIT_GUARD.maxSamplePosts).flatMap((item) => {
    const shortcode = String(item.shortCode || item.shortcode || "");
    const rawUrl = String(item.url || (shortcode ? `https://www.instagram.com/p/${shortcode}/` : ""));
    const url = normalizeInstagramPostUrl(rawUrl);
    if (!url) return [];
    const plays = number(item.videoPlayCount);
    const views = number(item.videoViewCount);
    const likes = number(item.likesCount);
    const comments = number(item.commentsCount);
    const caption = String(item.caption || "");
    const captionExcerpt = caption.slice(0, 500);
    return [{
      url,
      postedAt: typeof item.timestamp === "string" ? item.timestamp : null,
      type: String(item.type || item.productType || "post").slice(0, 24),
      captionExcerpt,
      ...extractEvidenceCopy(caption),
      likes,
      comments,
      plays,
      views,
      score: Math.max(plays, views) * 10 + likes + comments * 3,
    }];
  }).sort((a, b) => b.score - a.score || a.url.localeCompare(b.url)).slice(0, INSTAGRAM_CREDIT_GUARD.maxEvidencePosts);
}

function normalizeGeneratedCaption(raw: string, expectedCta: string): string | null {
  const caption = raw.trim().replace(/[‘’]/g, "'");
  const expected = expectedCta.trim().replace(/[‘’]/g, "'");
  if (!caption || !expected || expected.length > 280) return null;
  const ctaIndex = caption.toLowerCase().lastIndexOf(expected.toLowerCase());
  if (ctaIndex < 0) return null;
  let lead = caption.slice(0, ctaIndex).trim();
  const room = 300 - expected.length - (lead ? 2 : 0);
  if (lead.length > room) lead = lead.slice(0, room).replace(/\s+\S*$/, "").trim();
  return lead ? `${lead}\n\n${expected}` : expected;
}

function cleanGeneratedText(raw: string): string {
  const trimBlankLines = (value: string) => value
    .replace(/^(?:[ \t]*\r?\n)+/, "")
    .replace(/(?:\r?\n[ \t]*)+$/, "");
  let text = trimBlankLines(raw);
  const lines = text.split("\n");
  const fenceLines = lines.flatMap((line, index) => /^ {0,3}`{3,}.*$/i.test(line) ? [index] : []);
  if (fenceLines.length) {
    const validWrapper = fenceLines.length === 2
      && fenceLines[0] === 0
      && fenceLines[1] === lines.length - 1
      && /^```(?:text|markdown)?\s*$/i.test(lines[0])
      && /^```\s*$/.test(lines[lines.length - 1]);
    if (!validWrapper) return "\u0000INVALID_FENCE";
    text = trimBlankLines(lines.slice(1, -1).join("\n"));
  }
  text = text.split("\n").filter((line) => !/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)).join("\n");
  return text
    .replace(/^\*\*(HOOK|SCRIPT|CAPTION):\*\*\s*/gim, "$1: ")
    .replace(/^\*\*(HOOK|SCRIPT|CAPTION)\*\*:\s*/gim, "$1: ")
    .replace(/^\*\*(Slide\s+\d+\s+[—-]\s*[^\n*]+)\*\*\s*$/gim, "$1");
}

export function generatedOutputDiagnostic(raw: string, type: "reel" | "carousel", expectedCta: string): string {
  const text = cleanGeneratedText(raw);
  const labels = type === "reel"
    ? ["HOOK", "SCRIPT", "CAPTION"].map((label) => new RegExp(`^${label}:`, "mi").test(text))
    : [/^Slide\s+1\s+[—-]/mi.test(text), /^CAPTION:/mi.test(text)];
  const cta = text.replace(/[‘’]/g, "'").toLowerCase().includes(expectedCta.replace(/[‘’]/g, "'").toLowerCase());
  const hook = text.match(/^HOOK:[ \t]*([^\n]*)$/mi)?.[1].trim() || "";
  const lines = text.split("\n");
  const positions = ["HOOK", "SCRIPT", "CAPTION"].map((label) => lines.findIndex((line) => new RegExp(`^${label}:`, "i").test(line)));
  return `type=${type};chars=${text.length};labels=${labels.map(Number).join("")};cta=${Number(cta)};hookWords=${hook ? hook.split(/\s+/).length : 0};lines=${lines.length};positions=${positions.join(",")}`;
}

export function parseGeneratedReel(raw: string, expectedCta: string) {
  const match = cleanGeneratedText(raw).match(/^HOOK:[ \t]*([^\n]+)\n(?:[ \t]*\n)*SCRIPT:\s*\n?([\s\S]*?)\nCAPTION:\s*\n?([\s\S]*)$/i);
  if (!match) return null;
  const caption = normalizeGeneratedCaption(match[3], expectedCta);
  const result = { hook: match[1].trim(), script: match[2].trim(), caption };
  const hookWords = result.hook.split(/\s+/).filter(Boolean).length;
  if (!result.hook || hookWords > 12 || result.hook.length > 120) return null;
  if (!result.script || result.script.length > 12_000) return null;
  if (!result.caption) return null;
  return { ...result, caption: result.caption };
}

export function parseGeneratedCarousel(raw: string, expectedCta: string) {
  const text = cleanGeneratedText(raw);
  const markers = Array.from(text.matchAll(/\nCAPTION:\s*/gi));
  if (markers.length !== 1) return null;
  const marker = markers[0];
  const slidesPart = text.slice(0, marker.index);
  const caption = normalizeGeneratedCaption(text.slice((marker.index ?? 0) + marker[0].length), expectedCta);
  const headers = Array.from(slidesPart.matchAll(/^Slide\s+(\d+)\s+[—-]\s*([^\n]+)$/gim));
  if (headers.length < 7 || headers.length > 9 || headers[0]?.index !== 0) return null;
  if (headers.some((header, index) => Number(header[1]) !== index + 1)) return null;
  const slides = headers.map((header, index) => {
    const bodyStart = (header.index ?? 0) + header[0].length;
    const bodyEnd = index + 1 < headers.length ? headers[index + 1].index ?? slidesPart.length : slidesPart.length;
    return { heading: header[2].trim(), body: slidesPart.slice(bodyStart, bodyEnd).trim() };
  });
  if (!caption) return null;
  if (slides.some((slide) => !slide.heading || !slide.body || slide.heading.length > 100 || slide.body.length > 500)) return null;
  return { slides, caption };
}
