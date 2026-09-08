import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { ANDREW_CONTEXT, VOICE } from "@/lib/content";
import { contentDb } from "@/lib/supabase-content";
import { readBoundedRequestBody } from "@/lib/messaging";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-opus-4-8";
const MAX_BODY_BYTES = 4_000;

/**
 * Turn a competitor's winner into an idea of our own.
 *
 * The point is not to rewrite their title. It is to name why the video worked
 * — the tension it opened, the promise it made — and then ask what the same
 * mechanism looks like aimed at coaches and agency owners rather than at their
 * audience. Copying the topic is how you end up second; copying the reason it
 * worked is how you make it yours.
 */

type ModelledAngle = {
  whyItWorked: string;
  ourAngle: string;
  title: string;
  alternateTitles: string[];
  viewer: string;
  promise: string;
  openingHook: string;
  primaryKeyword: string;
  thumbnailText: string;
  differentiator: string;
};

const text = (value: unknown, field: string, max = 2_000): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is missing`);
  return value.trim().slice(0, max);
};

function validate(raw: unknown): ModelledAngle {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("The model returned an unusable shape");
  const v = raw as Record<string, unknown>;
  const alternates = Array.isArray(v.alternateTitles)
    ? v.alternateTitles.filter((t): t is string => typeof t === "string" && !!t.trim()).slice(0, 5).map((t) => t.trim().slice(0, 120))
    : [];
  return {
    whyItWorked: text(v.whyItWorked, "whyItWorked"),
    ourAngle: text(v.ourAngle, "ourAngle"),
    title: text(v.title, "title", 120),
    alternateTitles: alternates,
    viewer: text(v.viewer, "viewer", 500),
    promise: text(v.promise, "promise", 1_000),
    openingHook: text(v.openingHook, "openingHook", 1_500),
    primaryKeyword: text(v.primaryKeyword, "primaryKeyword", 120),
    thumbnailText: text(v.thumbnailText, "thumbnailText", 60),
    differentiator: text(v.differentiator, "differentiator", 1_000),
  };
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await readBoundedRequestBody(req, MAX_BODY_BYTES)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const videoId = typeof body.videoId === "string" ? body.videoId : null;
  const createIdea = body.createIdea === true;
  const format = body.format === "short" ? "short" : "long_form";
  if (!videoId) return NextResponse.json({ error: "videoId is required" }, { status: 400 });

  const db = contentDb();
  const { data: video } = await db
    .from("yt_competitor_videos")
    .select("video_id,title,url,view_count,likes,published_at,is_short,competitor_id")
    .eq("video_id", videoId)
    .maybeSingle();
  if (!video) return NextResponse.json({ error: "That video is not in the research set" }, { status: 404 });

  const { data: channel } = await db
    .from("yt_competitors")
    .select("name,handle,why_watch,description")
    .eq("id", video.competitor_id)
    .maybeSingle();

  const prompt = `${ANDREW_CONTEXT}

${VOICE}

A competitor video is outperforming its own channel. Work out why, then design the video Andrew should make.

COMPETITOR CHANNEL: ${channel?.name ?? "Unknown"} (@${channel?.handle ?? ""})
WHY WE WATCH THEM: ${channel?.why_watch ?? "Not recorded"}
THEIR VIDEO: ${video.title}
VIEWS: ${video.view_count ?? "unknown"}${video.published_at ? ` · published ${String(video.published_at).slice(0, 10)}` : ""}
FORMAT: ${video.is_short ? "Short" : "Long-form"}

Rules:
- Do NOT restate their topic with new words. Name the mechanism — the tension, the promise, the specific curiosity gap — and rebuild it for Andrew's audience of coaches, consultants and agency owners doing $5k to $100k a month.
- If their subject genuinely does not transfer, say so plainly in ourAngle and propose the nearest thing that does. Do not force it.
- The hook is spoken on camera in the first 10 seconds. Write it to be said out loud, not read.
- thumbnailText is 3 to 5 words, readable on a phone.
- differentiator: what Andrew can say here that this competitor cannot, drawn from his actual proof and offers.

Return ONLY minified JSON, no markdown fence:
{"whyItWorked":"...","ourAngle":"...","title":"...","alternateTitles":["...","..."],"viewer":"...","promise":"...","openingHook":"...","primaryKeyword":"...","thumbnailText":"...","differentiator":"..."}`;

  let angle: ModelledAngle;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const completion = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2_000,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = completion.content.find((block) => block.type === "text");
    if (!raw || raw.type !== "text") throw new Error("The model returned no text");
    const cleaned = raw.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    angle = validate(JSON.parse(cleaned));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not model that video" },
      { status: 502 },
    );
  }

  if (!createIdea) return NextResponse.json({ angle });

  // Drop it straight into the Create pipeline as an idea, carrying a link back
  // to what it came from so the source is never lost.
  const { data: item, error } = await db.from("content_items").insert({
    title: angle.title,
    category: "value",
    status: "idea",
    platforms: ["youtube"],
    creative_type: "video",
    video_script: null,
    media_urls: [],
    drafts: {},
    meta: {
      video_hub: true,
      video_destination: "youtube",
      video_stage: "idea",
      youtube_format: format,
      target_viewer: angle.viewer,
      promise: angle.promise,
      primary_keyword: angle.primaryKeyword,
      opening_hook: angle.openingHook,
      modelled_from: {
        videoId: video.video_id,
        videoTitle: video.title,
        videoUrl: video.url,
        channel: channel?.name ?? null,
        views: video.view_count,
        whyItWorked: angle.whyItWorked,
        ourAngle: angle.ourAngle,
        differentiator: angle.differentiator,
        thumbnailText: angle.thumbnailText,
        alternateTitles: angle.alternateTitles,
        modelledAt: new Date().toISOString(),
      },
    },
  }).select().single();

  if (error) return NextResponse.json({ angle, error: "The angle is ready but the idea could not be saved" }, { status: 500 });
  return NextResponse.json({ angle, item });
}
