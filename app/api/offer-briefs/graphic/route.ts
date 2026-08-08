import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 180;

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);
const BUCKET = "resource-media";

const STYLE = `7-FIGURE CEO GRAPHIC STYLE — clean, premium, black + gold.
PALETTE: near-black background #0b0b10. Gold #d4af37, lighter gold #f0d77b for titles and accents. Off-white text #f5f2e8, muted #b8b2a0. Cards: very dark #17141c with a thin gold outline; one "hero" element may be solid gold with dark text. Red #c0392b ONLY for small problem/pain pills.
TYPE: elegant serif for titles (Georgia-like), clean sans-serif for labels. Generous padding, generous spacing, high contrast, flat vector style. No photos, no textures, no gradients beyond the subtlest, no drop shadows.
LAYOUT LIBRARY (pick the clearest): ascension ladder · numbered systems map · pathway triangle (program name center, outcome words at corners) · funnels · timelines · before/after · offer stacks.`;

const BRIEF_RULES = `Write an IMAGE GENERATION BRIEF for this offer graphic. Return STRICT JSON only:
{"title": "short internal name", "image_prompt": "the full brief"}
The image_prompt must be a complete, standalone instruction for an image model:
- Start with: "Flat vector infographic, premium minimal design, crisp legible typography, 16:9 landscape."
- Give the full palette as hex codes.
- Describe the layout zone by zone.
- List EVERY text string in quotes, exactly as it must appear, attached to its zone. Keep labels SHORT (2-6 words); trim wording yourself.
- Say: "Render every quoted text string exactly as written, correctly spelled, fully inside its shape, never clipped or overlapped."
- Use the REAL offer, prices, and outcomes from the context. Max ~18 short text strings.`;

async function claudeBrief(context: string, want: string): Promise<{ title: string; image_prompt: string }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-opus-4-8", max_tokens: 3000,
      system: `You are the 7-Figure CEO graphic designer.\n\n${STYLE}\n\n${BRIEF_RULES}`,
      messages: [{ role: "user", content: `OFFER CONTEXT:\n${context}\n\nThe graphic they want:\n"""${want || "A clean overview graphic of this offer for social + sales."}"""\n\nWrite the image brief now.` }],
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const raw = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { title: string; image_prompt: string };
  if (!parsed?.image_prompt) throw new Error("Couldn't design that. Try describing it differently.");
  return parsed;
}

async function geminiRender(prompt: string): Promise<{ data: string; mime: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY missing — add it to the app's environment to generate graphics.");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }),
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

// POST { id, want? } — design + render an offer graphic and save it to the offer.
export async function POST(req: NextRequest) {
  const { id, want } = (await req.json()) as { id?: string; want?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI not configured." }, { status: 500 });

  const { data: o } = await db.from("offer_briefs").select("*").eq("id", id).single();
  if (!o) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  const context = [
    o.name && `OFFER: ${o.name}`,
    o.person && `WHO: ${o.person}`,
    o.promise && `PROMISE: ${o.promise}`,
    o.path && `PATH/STEPS: ${o.path}`,
    o.packaging && `INCLUDED: ${o.packaging}`,
    o.price_point && `PRICE: ${o.price_point}`,
    o.proof && `PROOF: ${o.proof}`,
    (!o.person && o.braindump) && `NOTES: ${o.braindump}`,
  ].filter(Boolean).join("\n");
  if (!context.trim()) return NextResponse.json({ error: "Fill in the offer (braindump + generate the 7 Ps) first." }, { status: 400 });

  try {
    const brief = await claudeBrief(context, (want ?? "").trim());
    const img = await geminiRender(brief.image_prompt);
    const ext = img.mime.includes("jpeg") ? "jpg" : "png";
    const path = `offer-graphics/${id}/${Date.now()}.${ext}`;
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, Buffer.from(img.data, "base64"), { contentType: img.mime, upsert: true });
    if (upErr) throw new Error(`Couldn't store the image: ${upErr.message}`);
    const image_url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    await db.from("offer_briefs").update({ graphic_url: image_url, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: true, graphic_url: image_url, title: brief.title });
  } catch (e) {
    console.error("offer graphic error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to generate graphic." }, { status: 500 });
  }
}
