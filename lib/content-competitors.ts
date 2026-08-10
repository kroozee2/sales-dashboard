export type CompetitorWatchStatus = "watching" | "active" | "paused";

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

function sanitizeSaved(value: unknown): ContentCompetitor | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  const status = value.watchStatus;
  return {
    id: value.id,
    name: value.name,
    focus: typeof value.focus === "string" ? value.focus : "",
    whyFit: typeof value.whyFit === "string" ? value.whyFit : "",
    pillars: Array.isArray(value.pillars) ? value.pillars.filter((x): x is string => typeof x === "string") : [],
    signaturePattern: typeof value.signaturePattern === "string" ? value.signaturePattern : "",
    andrewAdaptation: typeof value.andrewAdaptation === "string" ? value.andrewAdaptation : "",
    notes: typeof value.notes === "string" ? value.notes : "",
    watchStatus: status === "active" || status === "paused" || status === "watching" ? status : "watching",
    websiteUrl: safeWebsiteUrl(value.websiteUrl),
  };
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
