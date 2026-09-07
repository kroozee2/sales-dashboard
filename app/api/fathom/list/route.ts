import { NextResponse } from "next/server";
import { parseFathomMeetingList } from "@/lib/fathom-list";

const FATHOM_BASE = "https://api.fathom.ai/external/v1";

async function readBoundedJson(response: Response, maxBytes = 1_000_000): Promise<unknown> {
  if (!response.body) throw new Error("Empty Fathom response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Fathom response too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function GET() {
  const key = process.env.FATHOM_API_KEY;
  if (!key) return NextResponse.json({ error: "FATHOM_API_KEY not configured" }, { status: 500 });

  try {
    const response = await fetch(`${FATHOM_BASE}/meetings`, {
      headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return NextResponse.json({ error: `Fathom request failed with HTTP ${response.status}` }, { status: 502 });
    const raw = await readBoundedJson(response);
    const list = parseFathomMeetingList(raw);
    const cursor = (raw as Record<string, unknown>).next_cursor;
    if (cursor !== undefined && cursor !== null && (typeof cursor !== "string" || cursor.length > 1_000 || /[\u0000-\u001f\u007f-\u009f]/.test(cursor))) throw new Error("Invalid Fathom pagination cursor.");
    return NextResponse.json({ list: list.slice(0, 8), omitted: Math.max(0, list.length - 8), more_available: typeof cursor === "string" && cursor.length > 0 });
  } catch {
    return NextResponse.json({ error: "Fathom returned an invalid or unavailable response." }, { status: 502 });
  }
}
