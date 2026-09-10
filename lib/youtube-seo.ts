// Turning a video that has already been shot into something publishable.
//
// The planner writes the package *before* the camera goes on — hook, run of
// show, script. This is the other half: paste the link to what you actually
// recorded, read what you actually said, and write the title, description,
// chapters and tags from that rather than from the plan.
//
// Pure, so the parsing and the shaping can be checked without Apify or a model.

export type SeoPackage = {
  title: string;
  alternateTitles: string[];
  description: string;
  chapters: { time: string; label: string }[];
  tags: string[];
  pinnedComment: string;
  thumbnailText: string;
  shortsHooks: string[];
};

/**
 * The video id out of any YouTube link a person would actually paste: a watch
 * URL, a share link, a Short, a live stream, or the bare id itself.
 */
export function parseVideoId(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  if (/^[\w-]{11}$/.test(raw)) return raw;

  let url: URL;
  try { url = new URL(raw.startsWith("http") ? raw : `https://${raw}`); }
  catch { return null; }

  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (!/(^|\.)youtube\.com$/.test(host) && host !== "youtube-nocookie.com") return null;

  const v = url.searchParams.get("v");
  if (v && /^[\w-]{11}$/.test(v)) return v;

  const segments = url.pathname.split("/").filter(Boolean);
  const marker = segments.findIndex((s) => ["shorts", "live", "embed", "v"].includes(s));
  if (marker >= 0 && segments[marker + 1] && /^[\w-]{11}$/.test(segments[marker + 1])) {
    return segments[marker + 1];
  }
  return null;
}

export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;
export const studioUrl = (videoId: string) => `https://studio.youtube.com/video/${videoId}/edit`;

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#39;": "'", "&#x27;": "'", "&apos;": "'", "&nbsp;": " ",
};

/**
 * Apify hands captions back HTML-escaped, so "what&#39;s up" reaches the model
 * as literal entities and comes back out in the description.
 */
export function decodeCaptions(text: string): string {
  return (text ?? "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#x27);/g, (match) => ENTITIES[match] ?? match)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Long videos run past what is worth sending. The opening sets up the promise
 * and the close carries the call to action, so both ends are kept and the
 * middle is thinned rather than truncating and losing the ending entirely.
 */
export function trimTranscript(text: string, max = 24_000): string {
  const clean = decodeCaptions(text);
  if (clean.length <= max) return clean;
  const head = Math.floor(max * 0.65);
  const tail = max - head - 24;
  return `${clean.slice(0, head)}\n\n[…]\n\n${clean.slice(-tail)}`;
}

const str = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const list = (value: unknown, max: number, itemMax: number): string[] =>
  Array.isArray(value)
    ? value.map((v) => str(v, itemMax)).filter(Boolean).slice(0, max)
    : [];

/** YouTube's own limits, so nothing is written that cannot be pasted. */
export const LIMITS = { title: 100, description: 5_000, tag: 30, tagsTotal: 500 };

/**
 * Tags are capped at 500 characters in total by YouTube, not per tag. Sending
 * more silently drops the ones at the end, so the cut is made here where it can
 * be seen.
 */
export function fitTags(tags: string[]): string[] {
  const out: string[] = [];
  let used = 0;
  for (const tag of tags) {
    const clean = tag.trim().slice(0, LIMITS.tag);
    if (!clean) continue;
    const cost = clean.length + (out.length ? 1 : 0);
    if (used + cost > LIMITS.tagsTotal) break;
    out.push(clean);
    used += cost;
  }
  return out;
}

const TIME = /^(?:\d{1,2}:)?\d{1,2}:\d{2}$/;

/**
 * Chapters only work when the first one starts at zero and they run forward.
 * A list that breaks either rule is not a chapter list YouTube will render, so
 * it is dropped rather than pasted and quietly ignored.
 */
export function usableChapters(chapters: { time: string; label: string }[]): { time: string; label: string }[] {
  const clean = chapters.filter((c) => TIME.test(c.time) && c.label.trim());
  if (clean.length < 3) return [];
  const seconds = clean.map((c) => {
    const parts = c.time.split(":").map(Number);
    return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  });
  if (seconds[0] !== 0) return [];
  for (let i = 1; i < seconds.length; i += 1) if (seconds[i] <= seconds[i - 1]) return [];
  return clean;
}

export function shapeSeoPackage(raw: unknown): SeoPackage {
  const value = (raw ?? {}) as Record<string, unknown>;
  const chapters = Array.isArray(value.chapters)
    ? (value.chapters as unknown[]).map((c) => {
        const row = (c ?? {}) as Record<string, unknown>;
        return { time: str(row.time, 8), label: str(row.label, 100) };
      })
    : [];

  return {
    title: str(value.title, LIMITS.title),
    alternateTitles: list(value.alternateTitles, 5, LIMITS.title),
    description: str(value.description, LIMITS.description),
    chapters: usableChapters(chapters),
    tags: fitTags(list(value.tags, 30, LIMITS.tag)),
    pinnedComment: str(value.pinnedComment, 1_000),
    thumbnailText: str(value.thumbnailText, 60),
    shortsHooks: list(value.shortsHooks, 6, 200),
  };
}

/** The description as it should be pasted: body, then chapters, then links. */
export function renderDescription(seo: SeoPackage): string {
  const parts = [seo.description];
  if (seo.chapters.length) {
    parts.push(["Chapters:", ...seo.chapters.map((c) => `${c.time} ${c.label}`)].join("\n"));
  }
  return parts.join("\n\n").slice(0, LIMITS.description);
}
