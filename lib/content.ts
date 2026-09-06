import Anthropic from "@anthropic-ai/sdk";
import { REEL_PILLARS as PILLAR_LIST, EVENT_TYPES, type Platform, type Category } from "./content-constants";
export type { Platform, Category } from "./content-constants";
export { PLATFORMS, platformLabel, platformEmoji, CATEGORIES, REEL_PILLARS } from "./content-constants";

// ─── Model + client ───────────────────────────────────────────────────────────
const MODEL = "claude-opus-4-8";
let _client: Anthropic | null = null;
function ai(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return _client;
}
async function complete(system: string, user: string, maxTokens = 1600): Promise<string> {
  const res = await ai().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
}
async function completeVision(system: string, user: string, imageUrl: string, maxTokens = 1200): Promise<string> {
  const res = await ai().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "url", url: imageUrl } },
      { type: "text", text: user },
    ] }],
  });
  return res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
}
function parseJson<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.search(/[[{]/);
  const body = start >= 0 ? cleaned.slice(start) : cleaned;
  return JSON.parse(body) as T;
}

// ─── Andrew's brand context + voice (baked in — single user) ──────────────────
export const ANDREW_CONTEXT = `ABOUT THE CREATOR — Andrew Kroeze, founder of 7-Figure CEO.
He helps heart-centered coaches, consultants, and agency owners build peaceful, purposeful, wildly profitable 7-figure businesses.
Core method: Tribe of Buyers Formula — Offer Ecosystem, Brand Omni-Presence, Conversion Content, Scriptless Selling, Aligned Leverage (lean A-player team + AI + Airtable/GoHighLevel), Community.
Offers: 7-Figure CEO BOARDROOM ($20k+/mo coaches scaling past $100k/mo) and 7-Figure CEO LAUNCH (aspiring coaches cracking $20k/mo). A $47 7-day paid trial is the primary entry point.
Audience: coaches/consultants/agency owners doing $5k–$100k/mo who want more impact, freedom, and abundance without the revenue rollercoaster.
Big theme: use AI (especially Claude) inside your business to scale with a lean team.`;

export const VOICE = `WRITE IN ANDREW KROEZE'S VOICE (non-negotiable):
- Direct, warm, deeply human. A trusted mentor who's been in the trenches and has the receipts. Confident, not arrogant. Heart-led, not soft.
- NO em dashes, ever. Use commas, periods, or "..." instead.
- Never use: "amazing", "definitely", "absolutely", "totally", "guru", "hustle", "grind", "crush it", "kill it", "10x", "guaranteed", "magic bullet", "overnight", "just following up".
- Short lines. Lead with the reader's problem or identity, not credentials. Active voice. Specific numbers and real names.
- Real proof to draw from when relevant: Cole Gordon ($0 to $247K beta, then $40M agency), Bastiaan Slot ($30k/mo to $100k/mo in 90 days), Kavetha ($20k to $160k/mo in 4 months), Rae Ireland ($20k to $155k/mo), Franco Urbaez ($20k to $100k/mo), Jen & Stacy Conkey ($0 to $1M in 12 months), Kalah Hill ($1k to $24k/mo in 2 months).
- Every piece serves ONE goal: Attract, Nurture, or Convert. End marketing content with a clear, low-friction CTA.`;

// ─── Category framing (strategy per category) ─────────────────────────────────
const CATEGORY_FRAMING: Record<Category, string> = {
  connection: "CONNECTION content: tell a real, human story from Andrew's life or a client's, that builds trust and reveals shared values. No pitch. The point is to be known and relatable.",
  value: "VALUE content: teach ONE specific, useful thing they can act on today. Go one inch wide, one mile deep. Make them feel the 'aha'. Position the domino belief that the Tribe of Buyers Formula is the way to scale past $100k/mo.",
  proof: "PROOF content: a client win / 'Ring the Bell' moment. Lead with the specific result and named person, then the short before/after, then what made it possible. Ends by making the reader want the same.",
  action: "CTA / ACTION content: invite them to the next step (the $47 paid trial, the community, a workshop, or a call). Spike the emotion, plant the belief, make the ask low-friction and specific.",
  question: "QUESTION content: an engagement post that gets the audience to comment. One sharp, easy-to-answer question tied to their identity or a pain point. Warm and curious, not corporate.",
};

// ─── Reel format directives (server-side, keyed to REEL_PILLARS) ──────────────
const REEL_DIRECTIVES: Record<string, string> = {
  auto: "Pick the single best reel format for this idea.",
  demo: "Show a live demo or over-the-shoulder build of the thing.",
  listicle: "A tight numbered list of tips/steps, fast-paced.",
  hottake: "A contrarian, pattern-interrupt opinion that challenges a common belief.",
  story: "A short personal or client story with a lesson.",
  watch: "A curiosity-driven reveal that pays off by the end.",
  fix: "Name a common mistake, then the fix.",
  framework: "Teach a named, repeatable framework.",
  tip: "One sharp actionable tip, under 30 seconds.",
};
void PILLAR_LIST;

// ─── Per-platform output specs ────────────────────────────────────────────────
const PLATFORM_SKELETONS: Record<Platform, string> = {
  instagram: `OUTPUT: an Instagram REEL script.
- ON-SCREEN HOOK: max 12 words, must land in under 2 seconds.
- Then beats labeled "Say:" (what he says on camera) and "Show:" (what's on screen) for each section.
- CTA: drive to the comments, e.g. "Comment [WORD] and I'll send you [thing]". Never "DM me" or "link in bio".
- Then a CAPTION under 300 characters. No hashtags.`,
  instagram_post: `OUTPUT: a single Instagram feed POST (static image).
- HOOK line for the image (max 10 words).
- A short caption (120-220 words): hook, one clear idea taught in short lines, then a comment-CTA ("Comment [WORD]..."). No hashtags. No em dashes.`,
  carousel: `OUTPUT: an Instagram CAROUSEL as a slide-by-slide plan (7-9 slides). For each slide give: "Slide N — [heading]" then 1-2 short lines of body copy.
- Slide 1 = a scroll-stopping hook.
- Middle slides = one idea each, concrete and skimmable.
- Final slide = a comment-CTA ("Comment [WORD] for [thing]").
- Then a CAPTION under 300 characters. No hashtags.`,
  youtube: `OUTPUT: a YouTube video plan using the What → Why → How → Now framework.
- TITLE (curiosity + keyword).
- A spoken 7-part hook (first 30 seconds).
- An outline of the teaching (What, Why, How, Now).
- A DESCRIPTION with a book-a-call line and community link. Hashtags are fine here.`,
  email: `OUTPUT: an email to send from GoHighLevel.
- SUBJECT LINE begins with ⚫️.
- Greeting: "Hey {{contact.first_name}},"
- Body: one idea per short line, conversational, builds toward one CTA.
- Always end with a P.S.
- Sign off: "- AK"`,
  facebook: `OUTPUT: a Facebook post (personal profile or group).
- One sentence per line. Use ellipses to pace. Use ✅ / ❌ stacks and ALL-CAPS for emphasis where it fits.
- If there's a link, say the link goes in the FIRST COMMENT (never in the body).
- End with a clear CTA.`,
  skool: `OUTPUT: a Skool community post.
- A "Ring the Bell" style headline if it's proof, otherwise a strong hook.
- A ✅ bullet stack of what's inside / what they'll get.
- Named proof where relevant.
- A comment CTA and a P.S. that invites booking a call or grabbing the $47 trial.`,
  skool_paid: `OUTPUT: a post for a PAID Skool community (members already bought in).
- Lead with value or a win, not a pitch.
- Teach one concrete thing or celebrate a member result.
- Invite engagement (comment/question) or point to the next step inside the program. No cold-sell CTA.`,
  whatsapp: `OUTPUT: a short WhatsApp broadcast/message.
- Warm, personal, conversational — like texting a friend. 2-5 short lines.
- One clear idea or update, one simple CTA (reply, tap a link, or join).
- No formatting fluff, no hashtags, no em dashes.`,
};

function buildSystem(platform: Platform, category: Category, reelFormat?: string): string {
  const pillar = platform === "instagram" && reelFormat
    ? "\nREEL FORMAT: " + (REEL_DIRECTIVES[reelFormat] ?? "")
    : "";
  return `You are Andrew Kroeze's world-class content writer.
${ANDREW_CONTEXT}

${VOICE}

STRATEGY FOR THIS PIECE:
${CATEGORY_FRAMING[category]}${pillar}

${PLATFORM_SKELETONS[platform]}

Write only the finished piece, ready to use. No preamble, no "here's your...", no meta commentary.`;
}

// ─── Generate drafts (fan-out per platform) ───────────────────────────────────
export async function generateContentDrafts(input: {
  category: Category;
  platforms: Platform[];
  topic: string;
  eventContext?: string;
  reelFormat?: string;
}): Promise<Record<string, string>> {
  const { category, platforms, topic, eventContext, reelFormat } = input;
  const user = `TOPIC / IDEA:\n${topic}\n${eventContext ? `\nTHIS IS PROMOTING AN EVENT:\n${eventContext}\n` : ""}`;
  const entries = await Promise.all(
    platforms.map(async (p) => {
      try {
        const text = await complete(buildSystem(p, category, reelFormat), user, 1800);
        return [p, text] as const;
      } catch (e) {
        return [p, `⚠️ Generation failed: ${e instanceof Error ? e.message : "error"}`] as const;
      }
    })
  );
  return Object.fromEntries(entries);
}

// ─── Remix: mirror a pasted post's structure in Andrew's voice ────────────────
export async function remixPost(input: { source: string; platform: Platform; angle?: string }): Promise<string> {
  const { source, platform, angle } = input;
  const system = `You are Andrew Kroeze's content writer. You are given a piece of content that performed well.
Recreate it in Andrew's voice and business, keeping the EXACT structure, rhythm, hook style, line breaks, and emoji pattern of the original. Swap only the niche, examples, and proof so it fits Andrew (7-Figure CEO, coaches/consultants scaling past $100k/mo).

${ANDREW_CONTEXT}

${VOICE}

${PLATFORM_SKELETONS[platform]}

Return only the finished, rewritten piece.`;
  const user = `${angle ? `ANGLE TO STEER TOWARD: ${angle}\n\n` : ""}CONTENT TO MODEL:\n${source}`;
  return complete(system, user, 2000);
}

// ─── Clean a voice brain-dump into a usable idea ──────────────────────────────
export async function cleanTranscript(raw: string): Promise<string> {
  const system = `Turn this rambling voice dictation into one clean, tight content idea in plain language. Keep Andrew's meaning and any specifics (numbers, names). Fix filler and false starts. Return only the cleaned idea, 1-3 sentences. No preamble.`;
  return complete(system, raw, 400);
}

// ─── Idea classifier (text + optional screenshot) ─────────────────────────────
export interface IdeaMeta {
  title: string; angle: string; category: Category; platforms: Platform[];
  take: string; screenshot_summary: string;
}
export async function classifyIdea(text: string, imageUrl?: string): Promise<IdeaMeta> {
  const system = `You classify raw content ideas for Andrew Kroeze (7-Figure CEO). Given a thought (and maybe a screenshot of a post that inspired it), return JSON only:
{"title": "short label (max 8 words)", "angle": "the specific angle to take", "category": "connection|value|proof|action|question", "platforms": ["instagram"|"instagram_post"|"carousel"|"youtube"|"email"|"facebook"|"skool", ...], "take": "Andrew's spin on it in his voice", "screenshot_summary": "one line describing the screenshot, or empty"}
Pick the 1-3 platforms that best fit. Categories: connection(story), value(teach), proof(win), action(CTA), question(engagement).`;
  const raw = imageUrl
    ? await completeVision(system, text || "Classify this saved post as a content idea.", imageUrl, 600)
    : await complete(system, text, 600);
  return parseJson<IdeaMeta>(raw);
}

// ─── Proof → Content (a win becomes 4 ready posts) ────────────────────────────
export interface ProofAssets {
  ring_the_bell: { headline: string; body: string };
  client_celebrations: { label: string; body: string }[];
  client_story: { subject_line: string; body: string };
  webinar_story: { intro: string; methodology_point: string; story: string; transition: string };
  headline: string; proof_point: string; one_liner: string; story: string;
}
export async function generateProofContent(win: string, imageUrl?: string): Promise<ProofAssets> {
  const system = `You turn a client win into ready-to-post proof content for Andrew Kroeze.
${ANDREW_CONTEXT}
${VOICE}
Return JSON only:
{
 "headline": "punchy Ring-the-Bell headline",
 "proof_point": "the core number/result in a phrase",
 "one_liner": "one sentence summary with the name and result",
 "story": "3-5 sentence before/after story",
 "ring_the_bell": {"headline": "...", "body": "the celebration post body"},
 "client_celebrations": [{"label":"Short & Punchy","body":"..."},{"label":"With Name","body":"..."},{"label":"With CTA","body":"..."}],
 "client_story": {"subject_line":"⚫️ ...","body":"an email telling the story, greeting 'Hey {{contact.first_name}},', ends with P.S., signs '- AK'"},
 "webinar_story": {"intro":"...","methodology_point":"...","story":"...","transition":"..."}
}`;
  const user = `THE WIN:\n${win}`;
  const raw = imageUrl ? await completeVision(system, user, imageUrl, 2000) : await complete(system, user, 2000);
  return parseJson<ProofAssets>(raw);
}

// ─── Events + promo runways ───────────────────────────────────────────────────
export function eventContextOf(e: { title: string; event_type: string; start_date?: string | null; price?: number | null; spots_goal?: number | null; page_url?: string | null; location?: string | null; notes?: string | null }): string {
  const parts = [
    `Event: ${e.title} (${EVENT_TYPES.find((t) => t.key === e.event_type)?.label ?? e.event_type})`,
    e.start_date ? `Date: ${e.start_date}` : "",
    e.price != null ? `Price: $${e.price}` : "",
    e.spots_goal != null ? `Spots goal: ${e.spots_goal}` : "",
    e.location ? `Location: ${e.location}` : "",
    e.page_url ? `Signup link: ${e.page_url}` : "",
    e.notes ? `Notes: ${e.notes}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

export interface PromoItem { title: string; category: Category; days_before: number; platforms: Platform[] }
export async function planPromoCampaign(input: { event: { title: string; event_type: string; start_date?: string | null; price?: number | null; spots_goal?: number | null; page_url?: string | null; location?: string | null; notes?: string | null }; runwayDays: number }): Promise<PromoItem[]> {
  const { event, runwayDays } = input;
  const system = `You are Andrew Kroeze's launch strategist. Plan a promo runway of content leading up to an event, on his channels (instagram reel, instagram post, carousel, youtube, email, facebook, skool).
${ANDREW_CONTEXT}
Build 8-16 pieces across the runway that warm the audience, build belief, and drive signups. Mix categories (connection/value/proof/action/question), escalating to action near the event.
Return JSON only: {"items":[{"title":"...","category":"value","days_before": 10, "platforms":["email","instagram"]}]}
days_before is how many days before the event that piece goes out (0 = day of). Keep within ${runwayDays} days.`;
  const raw = await complete(system, eventContextOf(event), 3000);
  return parseJson<{ items: PromoItem[] }>(raw).items;
}

export interface PlannedItem { title: string; category: Category; day: number; platforms: Platform[]; draft?: string }
export async function planMonth(input: { monthName: string }): Promise<PlannedItem[]> {
  const system = `You are Andrew Kroeze's content strategist. Plan a full month of content on his cadence:
- Facebook: ~1 hook post/day
- Skool: 3/week (question post + 2-step promo + youtube promo)
- YouTube: 1/week (long-form teaching the domino belief)
- Email: 3/week
- Instagram: reels + posts a few times a week
${ANDREW_CONTEXT}
Return 16-24 items as JSON only: {"items":[{"title":"...","category":"value","day": 3, "platforms":["facebook","email"]}]}
day is 1-28. Spread categories across the month. No drafts needed, just the plan.`;
  const raw = await complete(system, `Plan content for ${input.monthName}.`, 6000);
  return parseJson<{ items: PlannedItem[] }>(raw).items;
}
