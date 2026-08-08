import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { contentDb } from "@/lib/supabase-content";

export const runtime = "nodejs";
export const maxDuration = 180;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const BUCKET = "resource-media";

// Two-stage pipeline: Claude (Opus) writes a precise IMAGE BRIEF from the request +
// brand, then gemini-3-pro-image renders it. Ported from the mastermind Graphics
// Studio and extended with format presets (YouTube thumbnails, IG graphics, …).

const BRAND = `7-FIGURE CEO brand — founder Andrew Kroeze. Premium, clean, heart-centered, high-status but not hypey. Helps coaches & online business owners scale to 7 figures with peace + purpose.
DEFAULT PALETTE (framework/offer graphics): near-black #0b0b10 background, gold #d4af37 + lighter gold #f0d77b for titles/accents, off-white #f5f2e8 text, muted #b8b2a0, very dark cards #17141c with thin gold outline; red #c0392b ONLY for small problem/pain pills. Elegant serif titles (Georgia-like), clean sans labels, flat premium vector, generous spacing, high contrast.`;

// Per-format art direction + aspect ratio.
const FORMATS: Record<string, { label: string; aspect: string; guidance: string }> = {
  youtube_thumbnail: {
    label: "YouTube Thumbnail",
    aspect: "16:9 landscape (1280x720)",
    guidance:
      "A HIGH-CTR YouTube thumbnail. HUGE, bold, punchy text — 3 to 6 words MAX, thick heavy sans, high contrast with a strong outline/glow so it's legible on a phone. One clear emotional hook. Loud saturated colors are welcome (don't force the black+gold here unless asked). If a reference face/photo is attached, keep a clear zone for it on one side and put the text on the other. Add a small accent (arrow, circle, number) if it sharpens the message. No paragraphs.",
  },
  instagram_post: {
    label: "Instagram Post",
    aspect: "1:1 square (1080x1080)",
    guidance:
      "A scroll-stopping Instagram feed graphic. One bold headline, short supporting line, clean on-brand layout. Readable at a glance, safe margins.",
  },
  instagram_story: {
    label: "IG Story / Reel Cover",
    aspect: "9:16 vertical (1080x1920)",
    guidance:
      "A vertical Instagram story / reel cover. Big headline in the top-middle third, keep the top ~250px and bottom ~250px clear of critical text (UI safe zones), strong single focal point.",
  },
  carousel: {
    label: "Carousel Slide",
    aspect: "4:5 portrait (1080x1350)",
    guidance:
      "One Instagram carousel slide: ONE big idea, minimal text, lots of negative space, swipe-friendly. Consistent, on-brand, easy to read.",
  },
  framework: {
    label: "Framework / Offer Graphic",
    aspect: "16:9 landscape",
    guidance:
      "A premium framework / offer infographic in the 7-Figure CEO black+gold style. Pick the clearest layout: ascension ladder (widest cheapest rung at the bottom, priciest at top in solid gold), numbered systems map (vertical cards with gold number circles), pathway triangle (program name centered, one step per side with a small red problem pill, big outcome words at the corners, solution boxes outside), funnels, timelines, before/after, comparison tables, offer stacks.",
  },
  freeform: {
    label: "Freeform Graphic",
    aspect: "whatever best fits the request (default 16:9)",
    guidance: "Design whatever the request calls for, on-brand unless they specify otherwise.",
  },
};
const fmt = (k?: string) => FORMATS[k ?? "freeform"] ?? FORMATS.freeform;

const briefRules = (f: { aspect: string; guidance: string }) => `Write an IMAGE GENERATION BRIEF for this graphic. Return STRICT JSON only:
{"title": "short internal name", "image_prompt": "the full brief"}

The image_prompt must be a complete, standalone instruction for an image model:
- Start with the format + aspect ratio: "${f.aspect}."
- Art direction for this format: ${f.guidance}
- Give the palette as hex codes (use the brand default unless the user named their own colors — their colors win completely).
- Describe the layout zone by zone (top→bottom, left→right).
- List EVERY visible text string in quotes, exactly as it must appear, attached to its zone. Keep each label SHORT so it renders cleanly; trim wording yourself.
- End with: "Render every quoted text string exactly as written, correctly spelled, fully inside its shape, never clipped or overlapped."
- Keep total text modest. For thumbnails/social: very few words. For frameworks: max ~18 short strings.`;

async function geminiRender(prompt: string, refImage?: { data: string; mime: string }): Promise<{ data: string; mime: string }> {
  const key = process.env.GEMINI_API_KEY!;
  const parts: object[] = [];
  if (refImage) parts.push({ inline_data: { mime_type: refImage.mime, data: refImage.data } });
  parts.push({ text: prompt });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }),
  });
  const j = await res.json();
  const outParts = j?.candidates?.[0]?.content?.parts ?? [];
  for (const p of outParts) {
    const d = p.inlineData || p.inline_data;
    if (d?.data) return { data: d.data, mime: d.mimeType || d.mime_type || "image/png" };
  }
  const txt = outParts.map((p: { text?: string }) => p.text).filter(Boolean).join(" ");
  throw new Error("The image model returned no image" + (txt ? `: ${txt.slice(0, 140)}` : ". Try again."));
}

async function fetchAsB64(url: string): Promise<{ data: string; mime: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const mime = r.headers.get("content-type") || "image/png";
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return null;
    return { data: buf.toString("base64"), mime };
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const { prompt, colors, example, exampleImageUrl, previousSpec, refine, format } = (await req.json()) as {
    prompt?: string; colors?: string; example?: string; exampleImageUrl?: string; previousSpec?: string; refine?: string; format?: string;
  };
  if (!prompt?.trim() && !refine?.trim() && !exampleImageUrl) return NextResponse.json({ error: "Describe the graphic you want." }, { status: 400 });

  const f = fmt(format);
  const withColors = colors?.trim() ? `${prompt ?? ""}\n\nUSE MY COLORS (these override the default palette): ${colors.trim()}` : (prompt ?? "");

  const userText = previousSpec && refine?.trim()
    ? `Here is the current image brief:\n"""${previousSpec.slice(0, 8000)}"""\n\nApply this change and return the full updated JSON brief (keep the same ${f.label} format + aspect ratio):\n"""${refine.trim().slice(0, 1500)}"""`
    : `Format: ${f.label} — ${f.aspect}.\n\n${exampleImageUrl ? `A reference graphic to MODEL is attached. Recreate its structure, layout, hierarchy, and energy, then apply the changes below (their colors, their words). Named colors beat the default palette.\n\n` : ""}The graphic they want${exampleImageUrl ? " (their changes to the reference)" : ""}:\n"""${withColors.trim().slice(0, 2000) || "Recreate the reference in the 7-Figure CEO brand."}"""${example?.trim() ? `\n\nAn example to model the look/structure on:\n"""${example.trim().slice(0, 2000)}"""` : ""}\n\nWrite the image brief now.`;

  const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: userText }];
  if (exampleImageUrl && !previousSpec) content.push({ type: "image", source: { type: "url", url: exampleImageUrl } });

  const db = contentDb();
  try {
    // 1) Claude writes the brief
    const msg = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 3000,
      system: `You are the 7-Figure CEO graphic designer.\n\n${BRAND}\n\n${briefRules(f)}`,
      messages: [{ role: "user", content }],
    });
    const raw = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { title: string; image_prompt: string };
    if (!parsed?.image_prompt) throw new Error("Couldn't design that one — try describing it differently.");

    // 2) Gemini renders it (with the reference image if one was uploaded)
    const ref = exampleImageUrl ? (await fetchAsB64(exampleImageUrl)) ?? undefined : undefined;
    const img = await geminiRender(parsed.image_prompt, ref);

    // 3) store the PNG in the content media bucket
    const ext = img.mime.includes("jpeg") ? "jpg" : "png";
    const path = `graphics/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, Buffer.from(img.data, "base64"), { contentType: img.mime, upsert: true });
    if (upErr) throw new Error(`Couldn't store the image: ${upErr.message}`);
    const image_url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    return NextResponse.json({ ok: true, image_url, spec: parsed.image_prompt, title: parsed.title });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ai error" }, { status: 500 });
  }
}
