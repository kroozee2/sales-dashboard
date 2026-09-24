// Matching a video in the Create pipeline to the one that actually went live.
//
// The working title is not the published title. "How to Assemble Your AI
// Agents" shipped as "Stop Hiring Humans: Build Your AI Team Instead", so
// matching on words alone guesses wrong and confidently links the wrong video.
//
// What does hold is the date. A video marked posted on the 23rd is the video
// published on the 23rd, and the format has to agree: a long-form entry is
// never a Short. So the date carries the match, the format gates it, and the
// title only breaks ties between candidates on the same day.
//
// Nothing here links anything on its own. It ranks candidates and says why, and
// a person confirms. A wrong link would put the wrong URL into a Skool post, an
// email and a DM, which is worse than no link at all.

export type YouTubeFormat = "long_form" | "short";

export interface PipelineItem {
  id: string;
  title: string;
  /** "long_form" | "short", from meta.youtube_format. */
  format: string | null;
  /** meta.shoot_at, an ISO timestamp. */
  shootAt: string | null;
  /** scheduled_date, a plain date. */
  scheduledDate: string | null;
  /** Fallback when neither date is set. */
  updatedAt: string | null;
}

export interface PostedVideo {
  videoId: string;
  title: string;
  url: string;
  postedAt: string | null;
  views: number | null;
}

/** A Short lives at /shorts/; everything else on the channel is long-form. */
export function videoFormat(url: string | null | undefined): YouTubeFormat {
  return /\/shorts\//i.test(url ?? "") ? "short" : "long_form";
}

const STOP = new Set([
  "the", "a", "an", "to", "of", "in", "on", "for", "and", "or", "your", "you",
  "my", "with", "this", "that", "is", "it", "how", "why", "what", "at", "by",
  "from", "into", "as", "be", "do", "i",
]);

export function titleTokens(title: string): Set<string> {
  return new Set(
    (title ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP.has(word)),
  );
}

/** Jaccard overlap of the meaningful words, 0-1. */
export function titleSimilarity(a: string, b: string): number {
  const left = titleTokens(a);
  const right = titleTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** The date a pipeline item is anchored to, best signal first. */
export function itemDate(item: PipelineItem): string | null {
  const raw = item.shootAt ?? item.scheduledDate ?? item.updatedAt;
  if (!raw) return null;
  const parsed = Date.parse(raw.length === 10 ? `${raw}T12:00:00Z` : raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

function daysApart(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const left = Date.parse(`${a}T12:00:00Z`);
  const right = Date.parse(`${b}T12:00:00Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.abs(Math.round((left - right) / 86_400_000));
}

export interface MatchCandidate {
  video: PostedVideo;
  /** 0-100. Anything under CONFIDENT wants a human to look. */
  score: number;
  /** Plain-English reasons, shown next to the suggestion. */
  reasons: string[];
  sameDay: boolean;
}

/** At or above this, the suggestion is safe to pre-select. Never auto-saved. */
export const CONFIDENT = 70;

/**
 * Score one video against one pipeline item.
 *
 * The date does the work: same day is worth far more than any wording overlap,
 * because the published title is routinely nothing like the working one. A
 * format mismatch is disqualifying rather than a penalty.
 */
export function scoreCandidate(item: PipelineItem, video: PostedVideo): MatchCandidate | null {
  const wantFormat: YouTubeFormat = item.format === "short" ? "short" : "long_form";
  const gotFormat = videoFormat(video.url);
  if (wantFormat !== gotFormat) return null;

  const postedOn = video.postedAt ? video.postedAt.slice(0, 10) : null;
  const gap = daysApart(itemDate(item), postedOn);
  const similarity = titleSimilarity(item.title, video.title);

  const reasons: string[] = [];
  let score = 0;

  if (gap === 0) { score += 70; reasons.push("published the same day"); }
  else if (gap === 1) { score += 45; reasons.push("published a day apart"); }
  else if (gap !== null && gap <= 3) { score += 25; reasons.push(`published ${gap} days apart`); }
  else if (gap !== null && gap <= 10) { score += 8; reasons.push(`published ${gap} days apart`); }
  else if (gap === null) reasons.push("no date to compare");

  if (similarity >= 0.5) { score += 25; reasons.push("title is close"); }
  else if (similarity >= 0.25) { score += 15; reasons.push("some words in common"); }
  else if (similarity > 0) { score += 5; reasons.push("a word in common"); }
  else reasons.push("title was rewritten");

  score += 5;
  reasons.push(wantFormat === "short" ? "both Shorts" : "both long-form");

  return { video, score: Math.min(100, score), reasons, sameDay: gap === 0 };
}

/**
 * Rank every posted video against one item, best first.
 *
 * Videos already linked to another item are excluded, so two pipeline entries
 * cannot claim the same upload.
 */
export function rankCandidates(
  item: PipelineItem, videos: PostedVideo[], takenVideoIds: Iterable<string> = [],
): MatchCandidate[] {
  const taken = new Set(takenVideoIds);
  return videos
    .filter((video) => !taken.has(video.videoId))
    .map((video) => scoreCandidate(item, video))
    .filter((candidate): candidate is MatchCandidate => candidate !== null)
    .sort((a, b) => b.score - a.score
      || (b.video.postedAt ?? "").localeCompare(a.video.postedAt ?? ""))
    .slice(0, 5);
}

export interface Suggestion {
  item: PipelineItem;
  best: MatchCandidate | null;
  others: MatchCandidate[];
  confident: boolean;
}

/**
 * One suggestion per unlinked item.
 *
 * Items are handled newest-date-first and each winning video is then off the
 * table, so the strongest match claims its video before a weaker one can.
 */
export function suggestLinks(
  items: PipelineItem[], videos: PostedVideo[], alreadyLinked: Iterable<string> = [],
): Suggestion[] {
  const taken = new Set(alreadyLinked);
  const ordered = [...items].sort((a, b) => (itemDate(b) ?? "").localeCompare(itemDate(a) ?? ""));

  return ordered.map((item) => {
    const ranked = rankCandidates(item, videos, taken);
    const [best, ...others] = ranked;
    if (best && best.score >= CONFIDENT) taken.add(best.video.videoId);
    return {
      item,
      best: best ?? null,
      others,
      confident: Boolean(best && best.score >= CONFIDENT),
    };
  });
}

/* ── What gets written onto the item once a link is confirmed ────────────── */

export interface VideoLink {
  video_id: string;
  url: string;
  posted_title: string;
  posted_at: string | null;
  linked_at: string;
  /** "suggested" when a person accepted a suggestion, "manual" when picked. */
  linked_by: "suggested" | "manual";
}

export function buildVideoLink(
  video: PostedVideo, how: VideoLink["linked_by"], now: Date,
): VideoLink {
  if (!video.videoId) throw new Error("A link needs the video id");
  if (!/^https?:\/\//i.test(video.url)) throw new Error("A link needs the video URL");
  return {
    video_id: video.videoId,
    url: video.url,
    posted_title: (video.title ?? "").trim() || "Untitled video",
    posted_at: video.postedAt,
    linked_at: now.toISOString(),
    linked_by: how,
  };
}

export function readVideoLink(meta: unknown): VideoLink | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const link = (meta as Record<string, unknown>).youtube_link;
  if (!link || typeof link !== "object" || Array.isArray(link)) return null;
  const record = link as Record<string, unknown>;
  if (typeof record.video_id !== "string" || typeof record.url !== "string") return null;
  return {
    video_id: record.video_id,
    url: record.url,
    posted_title: typeof record.posted_title === "string" ? record.posted_title : "Untitled video",
    posted_at: typeof record.posted_at === "string" ? record.posted_at : null,
    linked_at: typeof record.linked_at === "string" ? record.linked_at : "",
    linked_by: record.linked_by === "manual" ? "manual" : "suggested",
  };
}
