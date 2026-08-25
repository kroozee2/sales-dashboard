export type CompetitorWatchStatus = "watching" | "active" | "paused";

const MAX_EVIDENCE_POSTS = 8;
const MAX_SAMPLE_POSTS = 20;

function safeInstagramProfileUrl(value: string): string | undefined {
  const raw = value.trim();
  const handle = raw.startsWith("@") ? raw.slice(1) : raw;
  if (/^[A-Za-z0-9._]{1,30}$/.test(handle)) return `https://www.instagram.com/${handle}/`;
  try {
    const url = new URL(raw);
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.protocol !== "https:" || !["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase()) || parts.length !== 1) return undefined;
    return /^[A-Za-z0-9._]{1,30}$/.test(parts[0]) ? `https://www.instagram.com/${parts[0]}/` : undefined;
  } catch { return undefined; }
}

export interface CompetitorEvidence {
  url: string;
  postedAt: string | null;
  type: string;
  captionExcerpt: string;
  title: string;
  hook: string;
  description: string;
  cta: string;
  likes: number;
  comments: number;
  plays: number;
  views: number;
  score: number;
}

export interface ContentCompetitor {
  id: string;
  name: string;
  focus: string;
  whyFit: string;
  pillars: string[];
  signaturePattern: string;
  andrewAdaptation: string;
  notes: string;
  watchStatus: CompetitorWatchStatus;
  websiteUrl?: string;
  instagramUrl?: string;
  instagramHandle?: string;
  followers?: number;
  researchedAt?: string;
  sampledPostsCount?: number;
  evidence?: CompetitorEvidence[];
  revision?: string;
}

export interface CompetitorResearchLinks {
  youtube: string;
  instagram: string;
  linkedin: string;
  google: string;
}

export const DEFAULT_CONTENT_CREATORS: ContentCompetitor[] = [
  {
    id: "dan-henry",
    name: "Dan Henry",
    focus: "Direct response, premium offers, authority",
    whyFit: "Dan is a strong model for direct, conversion-focused teaching that turns expertise into demand for premium coaching and consulting offers.",
    pillars: ["Premium offers", "Direct-response messaging", "Authority positioning"],
    signaturePattern: "A blunt claim or mistake-led hook, followed by a concrete business lesson and decisive call to action.",
    andrewAdaptation: "Keep the clarity and commercial intent, then add Andrew's warmer mentor voice, client proof, and peaceful-growth philosophy.",
    notes: "",
    watchStatus: "active",
    websiteUrl: "https://www.danhenry.com",
  },
  {
    id: "jon-whiting",
    name: "Jon Whiting",
    focus: "Founder-led growth, content, business leverage",
    whyFit: "Jon's founder-first perspective is useful for studying how personal experience, strong opinions, and business lessons can build trust with sophisticated buyers.",
    pillars: ["Founder lessons", "Business leverage", "Audience growth"],
    signaturePattern: "A specific founder observation becomes a concise lesson, usually framed around what works in the real world.",
    andrewAdaptation: "Anchor the lesson in Andrew's own decisions, systems, and client rooms, then connect it to the Tribe of Buyers Formula.",
    notes: "",
    watchStatus: "active",
  },
  {
    id: "dan-bolton",
    name: "Dan Bolton",
    focus: "High-ticket growth, sales, identity",
    whyFit: "Dan's content sits close to Andrew's market and can reveal which high-ticket growth, sales, and identity angles are creating attention with ambitious online entrepreneurs.",
    pillars: ["High-ticket growth", "Sales psychology", "Entrepreneur identity"],
    signaturePattern: "Fast, conviction-heavy videos that name the audience's current constraint and reframe the standard advice.",
    andrewAdaptation: "Use the same speed and specificity without borrowed bravado, grounding every claim in calm authority, proof, and heart-centered leadership.",
    notes: "",
    watchStatus: "active",
  },
  {
    id: "alex-hormozi",
    name: "Alex Hormozi",
    focus: "Offers, leads, sales, business education",
    whyFit: "Alex is the benchmark for making complex acquisition and offer strategy simple, memorable, and highly shareable for owners who care about measurable growth.",
    pillars: ["Offer design", "Lead generation", "Sales and scaling"],
    signaturePattern: "A hard numerical hook, a named framework, plain-language teaching, and a short example that makes the lesson easy to repeat.",
    andrewAdaptation: "Model the compression and framework clarity, then use Andrew's coaching nuance, community lens, and client outcomes instead of copying the intensity.",
    notes: "",
    watchStatus: "watching",
    websiteUrl: "https://www.acquisition.com",
  },
  {
    id: "leila-hormozi",
    name: "Leila Hormozi",
    focus: "Leadership, operations, teams, founder mindset",
    whyFit: "Leila adds the operator and leadership side of scale, which maps directly to Andrew's aligned leverage, lean A-player teams, and peaceful-business positioning.",
    pillars: ["Leadership", "Team performance", "Operating discipline"],
    signaturePattern: "A calm, experience-backed opinion opens into a practical operating principle, often with a clear behavioral standard.",
    andrewAdaptation: "Turn Andrew's team, AI, and community operating principles into calm authority content that helps founders scale without chaos.",
    notes: "",
    watchStatus: "watching",
    websiteUrl: "https://www.acquisition.com",
  },
  {
    id: "daniel-priestley",
    name: "Daniel Priestley",
    focus: "Intellectual property, authority, premium positioning",
    whyFit: "Daniel is especially relevant for packaging expertise into named intellectual property and positioning coaches and consultants as category-leading authorities.",
    pillars: ["Key-person authority", "Intellectual property", "Premium positioning"],
    signaturePattern: "A memorable business model or diagnostic is introduced visually, then explained through simple stages and founder examples.",
    andrewAdaptation: "Use the structure to make Andrew's Tribe of Buyers Formula more visual, diagnostic, and repeatable across short and long-form content.",
    notes: "",
    watchStatus: "watching",
    websiteUrl: "https://www.danielpriestley.com",
  },
  {
    id: "chris-do",
    name: "Chris Do",
    focus: "Consultative selling, pricing, expert authority",
    whyFit: "Chris models how an expert can teach sales, pricing, and positioning with generosity while still attracting premium consulting and coaching buyers.",
    pillars: ["Value-based pricing", "Consultative selling", "Expert positioning"],
    signaturePattern: "A real objection or role-play becomes a teachable conversation, with exact language viewers can use immediately.",
    andrewAdaptation: "Apply the role-play and exact-language format to Scriptless Selling, enrollment conversations, and premium coaching objections.",
    notes: "",
    watchStatus: "watching",
    websiteUrl: "https://thefutur.com",
  },
];

export function buildResearchLinks(name: string): CompetitorResearchLinks {
  return {
    youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} business`)}`,
    instagram: `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com ${name}`)}`,
    linkedin: `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in ${name}`)}`,
    google: `https://www.google.com/search?q=${encodeURIComponent(`${name} business content`)}`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeWebsiteUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function safeEvidence(value: unknown): CompetitorEvidence[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value.slice(0, MAX_EVIDENCE_POSTS).flatMap((item) => {
    if (!isRecord(item) || typeof item.url !== "string" || !item.url.startsWith("https://www.instagram.com/")) return [];
    return [{
      url: item.url,
      postedAt: typeof item.postedAt === "string" ? item.postedAt : null,
      type: typeof item.type === "string" ? item.type.slice(0, 24) : "post",
      captionExcerpt: typeof item.captionExcerpt === "string" ? item.captionExcerpt.slice(0, 500) : "",
      title: typeof item.title === "string" ? item.title.slice(0, 120) : "",
      hook: typeof item.hook === "string" ? item.hook.slice(0, 280) : "",
      description: typeof item.description === "string" ? item.description.slice(0, 500) : "",
      cta: typeof item.cta === "string" ? item.cta.slice(0, 280) : "",
      likes: Number(item.likes || 0) || 0,
      comments: Number(item.comments || 0) || 0,
      plays: Number(item.plays || 0) || 0,
      views: Number(item.views || 0) || 0,
      score: Number(item.score || 0) || 0,
    }];
  });
  return rows.length ? rows : undefined;
}

function sanitizeSaved(value: unknown): ContentCompetitor | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  const id = value.id.trim();
  const name = value.name.trim();
  if (!/^[a-z0-9-]{1,80}$/i.test(id) || !name || name.length > 100) return null;
  const status = value.watchStatus;
  return {
    id,
    name,
    focus: typeof value.focus === "string" ? value.focus.slice(0, 500) : "",
    whyFit: typeof value.whyFit === "string" ? value.whyFit.slice(0, 1200) : "",
    pillars: Array.isArray(value.pillars) ? value.pillars.filter((x): x is string => typeof x === "string").slice(0, 10).map((x) => x.slice(0, 100)) : [],
    signaturePattern: typeof value.signaturePattern === "string" ? value.signaturePattern.slice(0, 1200) : "",
    andrewAdaptation: typeof value.andrewAdaptation === "string" ? value.andrewAdaptation.slice(0, 1200) : "",
    notes: typeof value.notes === "string" ? value.notes.slice(0, 5000) : "",
    watchStatus: status === "active" || status === "paused" || status === "watching" ? status : "watching",
    websiteUrl: safeWebsiteUrl(value.websiteUrl),
    instagramUrl: typeof value.instagramUrl === "string" ? safeInstagramProfileUrl(value.instagramUrl) : undefined,
    instagramHandle: typeof value.instagramHandle === "string" && /^[A-Za-z0-9._]{1,30}$/.test(value.instagramHandle) ? value.instagramHandle : undefined,
    followers: typeof value.followers === "number" && Number.isInteger(value.followers) && value.followers >= 0 ? value.followers : undefined,
    researchedAt: typeof value.researchedAt === "string" && Number.isFinite(Date.parse(value.researchedAt)) ? value.researchedAt : undefined,
    sampledPostsCount: Math.min(MAX_SAMPLE_POSTS, Math.max(0, Number(value.sampledPostsCount || 0) || 0)) || undefined,
    evidence: safeEvidence(value.evidence),
    revision: typeof value.revision === "string" && Number.isFinite(Date.parse(value.revision)) ? value.revision : undefined,
  };
}

export function sanitizeEditableCompetitor(value: unknown): ContentCompetitor | null {
  if (!isRecord(value)) return null;
  const editable = sanitizeSaved({
    id: value.id,
    name: value.name,
    focus: value.focus,
    whyFit: value.whyFit,
    pillars: value.pillars,
    signaturePattern: value.signaturePattern,
    andrewAdaptation: value.andrewAdaptation,
    notes: value.notes,
    watchStatus: value.watchStatus,
    websiteUrl: value.websiteUrl,
    instagramUrl: value.instagramUrl,
  });
  if (!editable) return null;
  delete editable.researchedAt;
  delete editable.sampledPostsCount;
  delete editable.evidence;
  delete editable.revision;
  return editable;
}

export function normalizeCompetitorResearch(value: unknown): ContentCompetitor | null {
  return sanitizeSaved(value);
}

export function isCompetitorPayloadWithinLimits(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 50) return false;
  try {
    return JSON.stringify(value).length <= 200_000;
  } catch {
    return false;
  }
}

export function mergeCompetitorResearch(saved: unknown): ContentCompetitor[] {
  const savedCreators = Array.isArray(saved)
    ? saved.map(sanitizeSaved).filter((creator): creator is ContentCompetitor => !!creator)
    : [];
  const savedById = new Map(savedCreators.map((creator) => [creator.id, creator]));
  const mergedDefaults = DEFAULT_CONTENT_CREATORS.map((creator) => ({
    ...creator,
    ...(savedById.get(creator.id) ?? {}),
  }));
  const defaultIds = new Set(DEFAULT_CONTENT_CREATORS.map((creator) => creator.id));
  return [...mergedDefaults, ...savedCreators.filter((creator) => !defaultIds.has(creator.id))];
}

export function mergeEditableCompetitorResponse(current: ContentCompetitor | null | undefined, saved: ContentCompetitor): ContentCompetitor {
  if (!current) return saved;
  if (current.instagramUrl !== saved.instagramUrl) return saved;
  return {
    ...current,
    ...saved,
    instagramHandle: current.instagramHandle,
    followers: current.followers,
    researchedAt: current.researchedAt,
    sampledPostsCount: current.sampledPostsCount,
    evidence: current.evidence,
  };
}

export function upsertCompetitorResearch(current: unknown, creator: unknown): ContentCompetitor[] {
  const existing = mergeCompetitorResearch(current);
  const valid = sanitizeSaved(creator);
  if (!valid) return existing;
  const index = existing.findIndex((item) => item.id === valid.id);
  if (index < 0) return [...existing, valid];
  return existing.map((item, i) => i === index ? valid : item);
}

export function parseCompetitorResearch(raw: string | null | undefined): ContentCompetitor[] {
  if (!raw) return mergeCompetitorResearch([]);
  try {
    return mergeCompetitorResearch(JSON.parse(raw));
  } catch {
    return mergeCompetitorResearch([]);
  }
}

export function slugifyCompetitorName(name: string): string {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `custom-${slug || "creator"}`;
}
