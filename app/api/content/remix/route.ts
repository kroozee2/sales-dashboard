import { NextRequest, NextResponse } from "next/server";
import { remixPost, type Platform } from "@/lib/content";

export const runtime = "nodejs";
export const maxDuration = 120;

// Paste a post that worked → get it rebuilt in Andrew's voice, same structure
export async function POST(req: NextRequest) {
  const { source, platform, angle } = await req.json() as { source: string; platform: Platform; angle?: string };
  if (!source?.trim()) return NextResponse.json({ error: "source required" }, { status: 400 });
  try {
    const text = await remixPost({ source, platform: platform ?? "facebook", angle });
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "remix failed" }, { status: 500 });
  }
}
