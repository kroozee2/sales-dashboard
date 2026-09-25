// What a group call is, what was said on it, and what got shared.
//
// Zoom names every session "Andrew Kroeze's Personal Meeting Room", so the
// recording cannot say which call it was. The weekday and the calendar slot
// can: Monday is Laser Coaching, Tuesday is the Claude AI call, Thursday is the
// Mastermind, or the Referral Party on the weeks it replaces it.
//
// Links come out of the Zoom chat by pattern, never from a model. A recap that
// invents a URL sends members somewhere that does not exist, so the model only
// ever labels a link it was handed.

export type CallType = "laser" | "ai" | "mastermind" | "referral";

export interface Series {
  type: CallType;
  name: string;
  short: string;
  emoji: string;
  day: string;
}

export const SERIES: Record<CallType, Series> = {
  laser: { type: "laser", name: "Laser Business Coaching", short: "Laser Coaching", emoji: "🚀", day: "Monday" },
  ai: { type: "ai", name: "Claude AI + Systems for Founders", short: "Claude AI + Systems", emoji: "🤖", day: "Tuesday" },
  mastermind: { type: "mastermind", name: "7FCEO Mastermind Session", short: "Mastermind", emoji: "🧠", day: "Thursday" },
  referral: { type: "referral", name: "7-Figure CEO Referral Party", short: "Referral Party", emoji: "🎉", day: "Thursday" },
};

export const CALL_TYPES = Object.keys(SERIES) as CallType[];

export function isCallType(value: unknown): value is CallType {
  return typeof value === "string" && value in SERIES;
}

/**
 * Which series a call belongs to.
 *
 * The event title wins when there is one, because the Referral Party takes the
 * Thursday slot some weeks and a weekday alone would call it a Mastermind.
 */
export function seriesFor(callDate: string, eventTitle?: string | null): CallType | null {
  const title = (eventTitle ?? "").toLowerCase();
  if (/referral/.test(title)) return "referral";
  if (/mastermind/.test(title)) return "mastermind";
  if (/lazer|laser/.test(title)) return "laser";
  if (/claude|ai \+ systems|systems for founders/.test(title)) return "ai";

  const day = new Date(`${callDate}T12:00:00Z`).getUTCDay();
  if (day === 1) return "laser";
  if (day === 2) return "ai";
  if (day === 4) return "mastermind";
  return null;
}

/* ── Links shared in the chat ─────────────────────────────────────────────── */

export interface SharedLink {
  url: string;
  sharedBy: string | null;
  /** "00:04:45" into the call. */
  at: string | null;
  /** Filled in afterwards by a person or the recap writer, from context. */
  label?: string | null;
}

// Things that appear in the chat or a summary but are not something a member
// should open: note-taker bots, the meeting's own join link, and the call's own
// recording. Fathom's summary links every bullet back to a moment in the
// recording, which is the call itself, not something that was shared on it.
const NOT_A_RESOURCE = [
  /fireflies\.ai/i,
  /otter\.ai/i,
  /read\.ai/i,
  /\bsally\.(io|ai)/i,
  /\btldv\.io/i,
  /\btactiq\.io/i,
  /\bnotta\.ai/i,
  /\bavoma\.com/i,
  /\bmeetgeek\.ai/i,
  /\bgrain\.com/i,
  // A bot's privacy notice or terms, pasted when it joins.
  /\/(privacy|terms)(-policy)?\/?$/i,
  /fathom\.video\//i,
  /zoom\.us\/(j|my|s|rec)\//i,
  /^https?:\/\/(www\.)?zoom\.us\/?$/i,
];

// A URL, or a bare domain with a path ("7figceo.com/miamievent") the way people
// actually paste them into a chat.
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"')\]]+|\b(?:[a-z0-9-]+\.)+(?:com|co|io|ai|app|net|org|so|me|us|video|link|ly|page|site)\/[^\s<>"')\]]*/gi;

function normalise(raw: string): string | null {
  let url = raw.trim().replace(/[.,;:!?]+$/, "");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes(".")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** A key that treats trailing slashes and http/https as the same link. */
function linkKey(url: string) {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").toLowerCase();
}

/**
 * Every link from a Zoom chat export, first mention kept.
 *
 * A Zoom chat line is "HH:MM:SS<tab>Name:<tab>message". Replies and reactions
 * reuse the same shape, so anything else is read as a continuation of the line
 * above rather than dropped.
 */
export function extractChatLinks(chat: string | null | undefined): SharedLink[] {
  if (!chat) return [];
  const found: SharedLink[] = [];
  const seen = new Set<string>();
  let sharedBy: string | null = null;
  let at: string | null = null;

  for (const line of chat.split(/\r?\n/)) {
    const match = line.match(/^(\d{2}:\d{2}:\d{2})\t([^\t]+?):?\t(.*)$/);
    let body = line;
    if (match) {
      at = match[1];
      sharedBy = match[2].replace(/:$/, "").trim() || null;
      body = match[3];
    }
    for (const raw of body.match(URL_PATTERN) ?? []) {
      const url = normalise(raw);
      if (!url || NOT_A_RESOURCE.some((pattern) => pattern.test(url))) continue;
      const key = linkKey(url);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ url, sharedBy, at });
    }
  }
  return found;
}

/** Merge link lists, keeping the first mention and any label already given. */
export function mergeLinks(...lists: SharedLink[][]): SharedLink[] {
  const byKey = new Map<string, SharedLink>();
  for (const list of lists) {
    for (const link of list) {
      const key = linkKey(link.url);
      const existing = byKey.get(key);
      if (!existing) byKey.set(key, { ...link });
      else if (!existing.label && link.label) existing.label = link.label;
    }
  }
  return [...byKey.values()];
}

/* ── Chapters from Zoom's summary ─────────────────────────────────────────── */

export interface Chapter {
  label: string;
  /** "00:04:42" */
  start: string;
  seconds: number;
}

export function toSeconds(stamp: string | null | undefined): number | null {
  const match = (stamp ?? "").match(/^(\d{1,2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/** Zoom's summary file lists topics with start times. Those are the chapters. */
export function chaptersFromZoomSummary(summary: unknown): Chapter[] {
  if (!summary || typeof summary !== "object") return [];
  const items = (summary as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const chapters: Chapter[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const { label, start_time: start } = item as { label?: unknown; start_time?: unknown };
    if (typeof label !== "string" || !label.trim() || typeof start !== "string") continue;
    const seconds = toSeconds(start);
    if (seconds === null) continue;
    chapters.push({ label: label.trim(), start: start.slice(0, 8), seconds });
  }
  return chapters.sort((a, b) => a.seconds - b.seconds);
}

/** "1:04:05" or "4:42", the way a player shows it. */
export function formatStamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/* ── The window the list shows ────────────────────────────────────────────── */

export const WINDOW_DAYS = 60;

/** The first date inside the window, as YYYY-MM-DD, counted from `today`. */
export function windowStart(today: string, days = WINDOW_DAYS): string {
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days);
  return start.toISOString().slice(0, 10);
}

/* ── Presenting the list ──────────────────────────────────────────────────── */

export interface RecapCall {
  id: string;
  call_date: string;
  call_type: CallType | null;
  title: string | null;
  summary: string | null;
  share_url: string | null;
  highlights?: string[] | null;
  links?: SharedLink[] | null;
  spotlights?: { name: string; topic?: string | null }[] | null;
}

/** "Mon, Sep 14" from a plain date, without a timezone shifting the day. */
export function callDateLabel(callDate: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return new Date(`${callDate}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

/** A link's readable name: its label, else its host and first path segment. */
export function linkName(link: SharedLink): string {
  if (link.label?.trim()) return link.label.trim();
  try {
    const url = new URL(link.url);
    const first = url.pathname.split("/").filter(Boolean)[0];
    return `${url.hostname.replace(/^www\./, "")}${first ? `/${first}` : ""}`;
  } catch {
    return link.url;
  }
}

/**
 * The message Andrew pastes into WhatsApp, Skool or an email: what the call
 * was, the replay, and the links from it. Built from the stored recap, so it
 * is the same wherever it is sent.
 */
export function buildShareMessage(call: RecapCall): string {
  const series = call.call_type ? SERIES[call.call_type] : null;
  const when = callDateLabel(call.call_date, { weekday: "long", month: "long", day: "numeric" });
  const lines = [
    `${series ? `${series.emoji} ${series.name}` : "🎥 Group call"} · ${when}`,
    call.title ? call.title : "",
    "",
  ];
  if (call.summary) lines.push(call.summary, "");
  const highlights = (call.highlights ?? []).slice(0, 4);
  if (highlights.length) {
    lines.push("What we covered:");
    for (const h of highlights) lines.push(`• ${h}`);
    lines.push("");
  }
  if (call.share_url) lines.push(`▶️ Watch the replay: ${call.share_url}`);
  const links = call.links ?? [];
  if (links.length) {
    lines.push("", "Links from the call:");
    for (const link of links.slice(0, 8)) lines.push(`• ${linkName(link)}: ${link.url}`);
  }
  return lines.filter((line, i, all) => !(line === "" && all[i - 1] === "")).join("\n").trim();
}

/** Does a call match what was typed in the search box? */
export function matchesQuery(call: RecapCall, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    call.title, call.summary,
    call.call_type ? SERIES[call.call_type].name : "",
    ...(call.highlights ?? []),
    ...(call.spotlights ?? []).flatMap((s) => [s.name, s.topic ?? ""]),
    ...(call.links ?? []).flatMap((l) => [l.url, l.label ?? ""]),
  ].join(" ").toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

/** The Monday a date falls in, as YYYY-MM-DD. Calls are grouped by week. */
export function weekOf(callDate: string): string {
  const d = new Date(`${callDate}T12:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export function groupByWeek<T extends { call_date: string }>(calls: T[]): { week: string; calls: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const call of [...calls].sort((a, b) => b.call_date.localeCompare(a.call_date))) {
    const key = weekOf(call.call_date);
    groups.set(key, [...(groups.get(key) ?? []), call]);
  }
  return [...groups].map(([week, list]) => ({ week, calls: list }));
}
