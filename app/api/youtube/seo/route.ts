import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { ANDREW_CONTEXT, VOICE } from "@/lib/content";
import { contentDb } from "@/lib/supabase-content";
import {
  parseVideoId, shapeSeoPackage, trimTranscript, watchUrl, type SeoPackage,
} from "@/lib/youtube-seo";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * SEO for a video that has already been shot.
 *
 * The planner writes a package before the camera goes on. This reads what was
 * actually said — the real transcript, not the plan — and writes the title,
 * description, chapters and tags from that. A video rarely comes out as the
 * outline said it would, and the description has to match the video.
 */

const MODEL = "claude-opus-4-8";
const TRANSCRIPT_ACTOR = "karamelo~youtube-transcripts";

async function fetchTranscript(videoId: string, token: string): Promise<{ transcript: string; title: string | null }> {
  const response = await fetch(
    `https://api.apify.com/v2/acts/${TRANSCRIPT_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=240`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ urls: [watchUrl(videoId)], outputFormat: "singleStringText" }),
      signal: AbortSignal.timeout(250_000),
    },
  );
  if (!response.ok) throw new Error("transcript service failed");

  const rows = (await response.json()) as Array<Record<string, unknown>>;
  // This actor returns rows out of input order, so the row is found by id
  // rather than taken from position zero. Index-mapping has already caused
  // misfiled transcripts elsewhere in this codebase's history.
  const row = Array.isArray(rows) ? rows.find((r) => r.videoId === videoId) : null;
  const captions = typeof row?.captions === "string" ? row.captions : "";
  if (!captions.trim()) throw new Error("no captions");
  return { transcript: captions, title: typeof row?.title === "string" ? row.title : null };
}

const PROMPT = (title: string, youtubeTitle: string | null, transcript: string) => `${ANDREW_CONTEXT}

${VOICE}

You are packaging a YouTube video that has ALREADY been recorded. Below is the
real transcript. Write the listing from what was actually said — not from what
the video was supposed to be about.

Planned title: ${title}
${youtubeTitle ? `Current title on YouTube: ${youtubeTitle}\n` : ""}
TRANSCRIPT:
${transcript}

Return ONLY JSON:
{
  "title": "under 100 characters, the specific promise this video actually delivers, no clickbait it does not pay off",
  "alternateTitles": ["4 more, each a different angle on the same video"],
  "description": "First two lines carry the promise, because that is all YouTube shows before 'more'. Then what the viewer gets, in Andrew's voice, short paragraphs. No hype words. End with one clear next step.",
  "chapters": [{"time": "0:00", "label": "..."}],
  "tags": ["12-20 search terms someone would actually type"],
  "pinnedComment": "one comment that invites a reply worth reading",
  "thumbnailText": "3-5 words, readable on a phone",
  "shortsHooks": ["3 moments in this video worth cutting as Shorts, quoted from the transcript"]
}

Rules that matter:
- Chapters must start at 0:00 and run forward, with timestamps that exist in this video. If the transcript does not let you place them honestly, return an empty array rather than inventing them.
- Never promise anything the transcript does not deliver.
- No em dashes.`;

export async function POST(req: NextRequest) {
  const apifyToken = process.env.APIFY_TOKEN;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!apifyToken) return NextResponse.json({ error: "Transcripts are not configured (APIFY_TOKEN)." }, { status: 503 });
  if (!anthropicKey) return NextResponse.json({ error: "Writing is not configured (ANTHROPIC_API_KEY)." }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }

  const id = typeof body.id === "string" ? body.id : null;
  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const videoId = parseVideoId(videoUrl);
  if (!videoId) return NextResponse.json({ error: "That is not a YouTube link we can read." }, { status: 400 });

  const db = contentDb();
  const { data: item, error: readError } = await db.from("content_items").select("*").eq("id", id).single();
  if (readError || !item) return NextResponse.json({ error: "That video is not on the board." }, { status: 404 });

  let transcript: string;
  let youtubeTitle: string | null;
  try {
    const fetched = await fetchTranscript(videoId, apifyToken);
    transcript = fetched.transcript;
    youtubeTitle = fetched.title;
  } catch (caught) {
    const reason = caught instanceof Error && caught.message === "no captions"
      ? "That video has no captions yet. YouTube usually takes a few minutes after upload."
      : "Could not read that video's transcript. Try again in a moment.";
    return NextResponse.json({ error: reason }, { status: 502 });
  }

  let seo: SeoPackage;
  try {
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4_000,
      messages: [{ role: "user", content: PROMPT(String(item.title ?? ""), youtubeTitle, trimTranscript(transcript)) }],
    });
    const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    seo = shapeSeoPackage(JSON.parse(json));
  } catch {
    return NextResponse.json({ error: "Could not write the listing. Try again." }, { status: 502 });
  }

  if (!seo.title || !seo.description) {
    return NextResponse.json({ error: "The listing came back incomplete. Try again." }, { status: 502 });
  }

  const meta = (item.meta ?? {}) as Record<string, unknown>;
  const { data: saved, error: writeError } = await db
    .from("content_items")
    .update({
      meta: {
        ...meta,
        youtube_video_id: videoId,
        youtube_seo: seo,
        youtube_seo_at: new Date().toISOString(),
        youtube_title_on_platform: youtubeTitle,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (writeError || !saved) return NextResponse.json({ error: "Wrote the listing but could not save it." }, { status: 500 });
  return NextResponse.json({ item: saved, seo, videoId });
}
