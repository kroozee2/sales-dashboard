import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { ANDREW_CONTEXT, VOICE } from "@/lib/content";
import { contentDb } from "@/lib/supabase-content";
import { readBoundedRequestBody } from "@/lib/messaging";

export const runtime = "nodejs";
export const maxDuration = 300;
const MAX_BODY_BYTES = 4_000;
const MAX_PACKAGE_BYTES = 180_000;
const MODEL = "claude-opus-4-8";

type VideoPackage = {
  recommendedTitle: string;
  alternateTitles: string[];
  thumbnailText: string;
  thumbnailBrief: string;
  openingHook: string;
  framework: string;
  runOfShow: Array<{ time: string; section: string; purpose: string }>;
  script: string;
  boardCopy: string;
  seoDescription: string;
  chapters: string[];
  keywords: string[];
  pinnedComment: string;
  clipHooks: string[];
  recordingChecklist: string[];
};

async function readBounded(req: NextRequest) {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new RangeError("Request body is too large");
  let text: string;
  try { text = await readBoundedRequestBody(req, MAX_BODY_BYTES); }
  catch (error) { if (error instanceof Error && error.message === "Request body is too large") throw new RangeError(error.message); throw error; }
  const raw = JSON.parse(text) as unknown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SyntaxError("Request body must be an object");
  const id = (raw as Record<string, unknown>).id;
  const expectedUpdatedAt = (raw as Record<string, unknown>).expectedUpdatedAt;
  if (typeof id !== "string" || !id.trim() || id.length > 100) throw new SyntaxError("id is required");
  if (typeof expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(expectedUpdatedAt))) throw new SyntaxError("expectedUpdatedAt is required");
  if (Object.keys(raw as Record<string, unknown>).some((key) => key !== "id" && key !== "expectedUpdatedAt")) throw new SyntaxError("Unsupported request field");
  return { id, expectedUpdatedAt };
}

const requiredString = (value: unknown, field: string, max = 100_000) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is missing from the generated package`);
  if (value.length > max) throw new Error(`${field} is too large`);
  return value.trim();
};
const stringArray = (value: unknown, field: string, maxItems = 30) => {
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string" || item.length > 5_000)) throw new Error(`${field} is invalid`);
  const normalized = value.map((item) => item.trim()).filter(Boolean);
  if (!normalized.length) throw new Error(`${field} must not be empty`);
  return normalized;
};

function validatePackage(raw: unknown): VideoPackage {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Generated package must be an object");
  const value = raw as Record<string, unknown>;
  const runOfShow = Array.isArray(value.runOfShow) ? value.runOfShow.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("runOfShow is invalid");
    const row = entry as Record<string, unknown>;
    return { time: requiredString(row.time, "runOfShow.time", 30), section: requiredString(row.section, "runOfShow.section", 200), purpose: requiredString(row.purpose, "runOfShow.purpose", 1_000) };
  }) : [];
  if (!runOfShow.length || runOfShow.length > 30) throw new Error("runOfShow is invalid");
  const result: VideoPackage = {
    recommendedTitle: requiredString(value.recommendedTitle, "recommendedTitle", 120),
    alternateTitles: stringArray(value.alternateTitles, "alternateTitles", 8),
    thumbnailText: requiredString(value.thumbnailText, "thumbnailText", 50),
    thumbnailBrief: requiredString(value.thumbnailBrief, "thumbnailBrief", 2_000),
    openingHook: requiredString(value.openingHook, "openingHook", 3_000),
    framework: requiredString(value.framework, "framework", 1_000),
    runOfShow,
    script: requiredString(value.script, "script", 100_000),
    boardCopy: requiredString(value.boardCopy, "boardCopy", 30_000),
    seoDescription: requiredString(value.seoDescription, "seoDescription", 10_000),
    chapters: stringArray(value.chapters, "chapters", 30),
    keywords: stringArray(value.keywords, "keywords", 40),
    pinnedComment: requiredString(value.pinnedComment, "pinnedComment", 2_000),
    clipHooks: stringArray(value.clipHooks, "clipHooks", 20),
    recordingChecklist: stringArray(value.recordingChecklist, "recordingChecklist", 30),
  };
  const thumbnailWords = result.thumbnailText.split(/\s+/).filter(Boolean).length;
  if (thumbnailWords < 2 || thumbnailWords > 5) throw new Error("thumbnailText must contain 2-5 words");
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_PACKAGE_BYTES) throw new Error("Generated package is too large");
  return result;
}

function extractJson(text: string) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI did not return valid JSON");
  return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
}

export async function POST(req: NextRequest) {
  let input: { id: string; expectedUpdatedAt: string };
  try { input = await readBounded(req); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: error instanceof RangeError ? 413 : 400 }); }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "YouTube package generation is not configured" }, { status: 503 });
  const db = contentDb();
  const { data: item, error } = await db.from("content_items").select("*").eq("id", input.id).single();
  if (error || !item) return NextResponse.json({ error: "YouTube content item not found" }, { status: 404 });
  const meta = item.meta && typeof item.meta === "object" && !Array.isArray(item.meta) ? item.meta as Record<string, unknown> : {};
  if (!Array.isArray(item.platforms) || !item.platforms.includes("youtube") || item.creative_type !== "video" || meta.video_hub !== true) {
    return NextResponse.json({ error: "Item is not a YouTube Video Hub record" }, { status: 409 });
  }
  if (item.updated_at !== input.expectedUpdatedAt) {
    return NextResponse.json({ error: "This YouTube item changed elsewhere. Refresh before generating." }, { status: 409 });
  }

  const system = `You are Andrew Kroeze's expert YouTube producer and SEO strategist.\n${ANDREW_CONTEXT}\n${VOICE}\nCreate a complete record-ready package. Andrew normally teaches from one continuous Miro-style board and screen demonstrations. Use Person → Problems → Promise → Process → Action as the viewer journey. Show the finished result in the opening, state honest boundaries, and keep every claim grounded in the supplied idea. Do not invent client proof, metrics, links, search volume, or transcript timestamps. Use provisional chapter timing only and label it for adjustment after recording. Return JSON only with exactly these keys: recommendedTitle, alternateTitles, thumbnailText, thumbnailBrief, openingHook, framework, runOfShow[{time,section,purpose}], script, boardCopy, seoDescription, chapters[], keywords[], pinnedComment, clipHooks[], recordingChecklist[]. The script must separate spoken narration from [BOARD], [SCREEN], and [PAUSE] directions. Thumbnail text must be 2-5 phone-readable words. Titles should be clear on mobile.`;
  const user = `WORKING TITLE: ${item.title}\nFORMAT: ${meta.youtube_format ?? "long_form"}\nTARGET VIEWER: ${meta.target_viewer ?? ""}\nPROMISE: ${meta.promise ?? ""}\nPRIMARY KEYWORD: ${meta.primary_keyword ?? ""}\nOPENING HOOK NOTES: ${meta.opening_hook ?? ""}\nOTHER NOTES: ${String(item.notes ?? "").slice(0, 6_000)}`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({ model: MODEL, max_tokens: 8000, system, messages: [{ role: "user", content: user }] });
    const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("");
    const videoPackage = validatePackage(extractJson(text));
    const drafts = { ...(item.drafts ?? {}), youtube: videoPackage.seoDescription };
    const nextMeta = { ...meta, opening_hook: videoPackage.openingHook, youtube_package: videoPackage, package_generated_at: new Date().toISOString() };
    const { data, error: updateError } = await db
      .from("content_items")
      .update({ video_script: videoPackage.script, drafts, meta: nextMeta, status: item.status === "idea" ? "drafted" : item.status, updated_at: new Date().toISOString() })
      .eq("id", input.id)
      .eq("updated_at", input.expectedUpdatedAt)
      .select()
      .maybeSingle();
    if (updateError) return NextResponse.json({ error: "Could not save the generated YouTube package" }, { status: 500 });
    if (!data) return NextResponse.json({ error: "This YouTube item changed while its package was generating. Refresh and try again." }, { status: 409 });
    return NextResponse.json({ item: data, package: videoPackage });
  } catch {
    return NextResponse.json({ error: "YouTube package generation failed. Try again." }, { status: 502 });
  }
}
