export type ScriptSourceItem = {
  id: string;
  title: unknown;
  scheduled_date: string | null;
  media_urls?: string[] | null;
  notes?: string | null;
  video_script: string | null;
  meta?: Record<string, unknown> | null;
};

export type YouTubeRunOfShowEntry = { time: string; section: string; purpose: string };

export type YouTubeScriptPackage = {
  recommendedTitle: string | null;
  alternateTitles: string[];
  openingHook: string | null;
  framework: string | null;
  runOfShow: YouTubeRunOfShowEntry[];
  thumbnailText: string | null;
  thumbnailBrief: string | null;
  seoDescription: string | null;
  boardCopy: string | null;
  chapters: string[];
  keywords: string[];
  pinnedComment: string | null;
  clipHooks: string[];
  recordingChecklist: string[];
  script: string | null;
};

export type YouTubeScriptRow = {
  id: string;
  sourceTitle: string;
  title: string;
  stage: string;
  shootAt: string | null;
  scheduledDate: string | null;
  script: string | null;
  notes: string | null;
  scriptReadiness: "Script ready" | "Package saved; script unavailable";
  thumbnailText: string | null;
  thumbnailStatus: "Image ready" | "Copy ready" | "Brief ready" | "Unavailable";
  package: YouTubeScriptPackage | null;
};

const STAGES = new Set(["idea", "planning", "recording", "editing", "ready", "published"]);

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean || null;
}

function cleanStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(cleanString).filter((entry): entry is string => entry !== null) : [];
}

function cleanRunOfShow(value: unknown): YouTubeRunOfShowEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const time = cleanString(record.time);
    const section = cleanString(record.section);
    const purpose = cleanString(record.purpose);
    return time && section && purpose ? [{ time, section, purpose }] : [];
  });
}

export function getYouTubePackage(item: ScriptSourceItem): YouTubeScriptPackage | null {
  const value = item.meta?.youtube_package;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const pkg = value as Record<string, unknown>;
  return {
    recommendedTitle: cleanString(pkg.recommendedTitle),
    alternateTitles: cleanStrings(pkg.alternateTitles),
    openingHook: cleanString(pkg.openingHook),
    framework: cleanString(pkg.framework),
    runOfShow: cleanRunOfShow(pkg.runOfShow),
    thumbnailText: cleanString(pkg.thumbnailText),
    thumbnailBrief: cleanString(pkg.thumbnailBrief),
    seoDescription: cleanString(pkg.seoDescription),
    boardCopy: cleanString(pkg.boardCopy),
    chapters: cleanStrings(pkg.chapters),
    keywords: cleanStrings(pkg.keywords),
    pinnedComment: cleanString(pkg.pinnedComment),
    clipHooks: cleanStrings(pkg.clipHooks),
    recordingChecklist: cleanStrings(pkg.recordingChecklist),
    script: cleanString(pkg.script),
  };
}

export function copyableAssetText(
  _label: string,
  value: string | string[] | YouTubeRunOfShowEntry[] | null | undefined,
): string | null {
  if (typeof value === "string") return cleanString(value);
  if (!Array.isArray(value) || value.length === 0) return null;
  if (typeof value[0] === "string") {
    const lines = cleanStrings(value);
    return lines.length ? lines.join("\n") : null;
  }
  const rows = cleanRunOfShow(value);
  return rows.length ? rows.map((row) => `${row.time} | ${row.section} | ${row.purpose}`).join("\n") : null;
}

function isValidDateParts(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function formatScriptDate(value: string | null | undefined): string {
  if (!value || !isValidDateParts(value)) return "Unavailable";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

const RFC3339_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;

export function formatScriptDateTime(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  const match = RFC3339_DATE_TIME.exec(value);
  if (!match || !isValidDateParts(match[1])) return "Unavailable";
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  const offsetHour = match[6] === undefined ? 0 : Number(match[6]);
  const offsetMinute = match[7] === undefined ? 0 : Number(match[7]);
  if (hour > 23 || minute > 59 || second > 59 || offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return "Unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(date);
}

function hasAuthoritativeThumbnail(meta: Record<string, unknown> | null | undefined): boolean {
  const candidate = cleanString(meta?.thumbnail_url) ?? cleanString(meta?.youtube_thumbnail_url);
  if (!candidate) return false;
  try {
    const url = new URL(candidate);
    return (url.protocol === "https:" || url.protocol === "http:") && /\.(?:avif|gif|jpe?g|png|webp)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function getScriptRows(items: ScriptSourceItem[]): YouTubeScriptRow[] {
  return items.flatMap((item) => {
    const pkg = getYouTubePackage(item);
    const savedScript = cleanString(item.video_script) ?? pkg?.script ?? null;
    if (!savedScript && !pkg) return [];
    const stage = cleanString(item.meta?.video_stage);
    const thumbnailText = pkg?.thumbnailText ?? null;
    const hasImage = hasAuthoritativeThumbnail(item.meta);
    const thumbnailStatus = hasImage ? "Image ready" : thumbnailText ? "Copy ready" : pkg?.thumbnailBrief ? "Brief ready" : "Unavailable";
    return [{
      id: item.id,
      sourceTitle: cleanString(item.title) ?? "Unavailable",
      title: pkg?.recommendedTitle ?? cleanString(item.title) ?? "Unavailable",
      stage: stage && STAGES.has(stage) ? stage : "Unavailable",
      shootAt: cleanString(item.meta?.shoot_at),
      scheduledDate: cleanString(item.scheduled_date),
      script: savedScript,
      notes: cleanString(item.notes),
      scriptReadiness: savedScript ? "Script ready" : "Package saved; script unavailable",
      thumbnailText,
      thumbnailStatus,
      package: pkg,
    } satisfies YouTubeScriptRow];
  });
}
