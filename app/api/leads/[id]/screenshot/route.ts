import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

type MediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

export interface ScreenshotAnalysis {
  summary: string;
  about_them: string;
  signals: string[];
  stage: string;
  next_message: string;
  questions: string[];
  watch_outs: string[];
}

// GET — all saved conversation screenshots for this lead
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createLeadsAdminClient();
  const { data, error } = await db
    .from("lead_screenshots")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ screenshots: data ?? [] });
}

// DELETE — remove one screenshot
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { screenshotId } = await req.json() as { screenshotId: string };
  if (!screenshotId) return NextResponse.json({ error: "screenshotId required" }, { status: 400 });
  const db = createLeadsAdminClient();
  const { error } = await db.from("lead_screenshots").delete().eq("id", screenshotId).eq("lead_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// POST — upload a conversation screenshot, read it, and save the context + next move
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { imageData, mimeType } = await req.json() as { imageData: string; mimeType?: string };
  if (!imageData) return NextResponse.json({ error: "imageData required" }, { status: 400 });

  const db = createLeadsAdminClient();

  // ── 1. Store the image
  const b64 = imageData.includes(",") ? imageData.split(",")[1] : imageData;
  const buffer = Buffer.from(b64, "base64");
  const mt = (mimeType || "image/png") as MediaType;
  const ext = mt.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const path = `${id}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await db.storage.from("lead-screenshots").upload(path, buffer, { contentType: mt, upsert: false });
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
  const { data: pub } = db.storage.from("lead-screenshots").getPublicUrl(path);
  const imageUrl = pub.publicUrl;

  // ── 2. Gather what we already know about this person
  const [{ data: lead }, { data: notes }, { data: priors }, { data: scripts }] = await Promise.all([
    db.from("leads").select("*").eq("id", id).single(),
    db.from("lead_notes").select("text, created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(8),
    db.from("lead_screenshots").select("analysis, created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(3),
    db.from("dm_scripts").select("category, title, body").eq("active", true).limit(40),
  ]);

  const leadCtx = lead
    ? `Name: ${lead.full_name ?? "unknown"}
Pipeline stage: ${lead.prospect_stage ?? "unknown"}
Source: ${lead.source ?? "unknown"}
Revenue level: ${lead.revenue_level ?? "unknown"}
Quality: ${lead.quality ?? "unknown"}
Existing notes: ${lead.notes ?? "none"}`
    : "No lead record found.";

  const noteCtx = (notes ?? []).map((n: { text: string }) => `- ${n.text}`).join("\n") || "none";
  const priorCtx = (priors ?? [])
    .map((p: { analysis: Partial<ScreenshotAnalysis> }) => `- ${p.analysis?.summary ?? ""}`)
    .filter((s) => s.trim() !== "-")
    .join("\n") || "none";
  const scriptCtx = (scripts ?? [])
    .slice(0, 25)
    .map((s: { category: string; title: string; body: string }) => `[${s.category}] ${s.title}: ${s.body}`)
    .join("\n");

  // ── 3. Read the conversation and decide the next move
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are Andrew Kroeze's DM setting strategist. Andrew runs 7-Figure CEO, helping heart-centered coaches and consultants scale past $100K/month. Offers include a $47 paid trial, the 7-Figure CEO LAUNCH and BOARDROOM programs, a free "Claude for Founders" resource, and a Miami mastermind event in September.

This screenshot is a DM/chat conversation with a prospect. Read it carefully — who said what, and where the conversation actually stands.

WHAT WE ALREADY KNOW ABOUT THIS PERSON:
${leadCtx}

RECENT NOTES ON THEM:
${noteCtx}

CONTEXT FROM EARLIER SCREENSHOTS OF THIS PERSON:
${priorCtx}

ANDREW'S PROVEN DM SCRIPTS (match the tone, adapt to this person, do not paste verbatim):
${scriptCtx}

ANDREW'S VOICE RULES:
- Warm, direct, human. Never salesy, never guru-speak, never hype.
- NEVER use em dashes. Use commas, periods, or restructure.
- Don't pitch directly in the DM. Spike emotion, plant a belief, or spark curiosity.
- Short messages. Lead with them, not with us.
- Ask one clear question at a time.

Return ONLY valid JSON, no markdown fence, in exactly this shape:
{
  "summary": "1-2 sentences on what is happening in this conversation right now",
  "about_them": "who they are and their situation, based only on what they actually said",
  "signals": ["specific buying signals, pains, or key facts they revealed"],
  "stage": "where this conversation stands (e.g. 'Rapport built, not yet qualified')",
  "next_message": "the exact next message Andrew should send, in his voice, ready to copy and paste",
  "questions": ["the best next question to ask", "an alternative question"],
  "watch_outs": ["objections, sensitivities, or mistakes to avoid with this person"]
}`;

  let analysis: ScreenshotAnalysis;
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2500,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mt, data: b64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
    // Concatenate every text block, then pull out the JSON object
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    if (!text) throw new Error("Empty model response");
    const stripped = text.replace(/```json\s*|\s*```/g, "").trim();
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error(`No JSON in response: ${stripped.slice(0, 200)}`);
    analysis = JSON.parse(stripped.slice(start, end + 1)) as ScreenshotAnalysis;
  } catch (e) {
    return NextResponse.json(
      { error: `Could not read the screenshot: ${e instanceof Error ? e.message : "unknown error"}`, image_url: imageUrl },
      { status: 500 }
    );
  }

  // ── 4. Save it against the person
  const { data: saved, error: saveErr } = await db
    .from("lead_screenshots")
    .insert({ lead_id: id, image_url: imageUrl, analysis })
    .select()
    .single();
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  return NextResponse.json({ screenshot: saved });
}
