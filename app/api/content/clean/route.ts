import { NextRequest, NextResponse } from "next/server";
import { cleanTranscript } from "@/lib/content";

export const runtime = "nodejs";

// Turn a rambling voice brain-dump into a clean content idea
export async function POST(req: NextRequest) {
  const { raw } = await req.json() as { raw: string };
  if (!raw?.trim()) return NextResponse.json({ error: "raw required" }, { status: 400 });
  try {
    const cleaned = await cleanTranscript(raw);
    return NextResponse.json({ cleaned });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "clean failed" }, { status: 500 });
  }
}
