import { NextRequest, NextResponse } from "next/server";
import {
  INSTAGRAM_HOT_LEADS_MAX_BODY_BYTES,
  InstagramHotLeadsImportConflictError,
  parseInstagramHotLeadsDocument,
  replaceInstagramHotLeads,
} from "@/lib/instagram-hot-leads";
import {
  InstagramHotLeadsConflictError,
  mutateInstagramHotLeads,
  readInstagramHotLeads,
} from "@/lib/instagram-hot-leads-store";

function errorResponse(error: unknown) {
  if (error instanceof InstagramHotLeadsConflictError || error instanceof InstagramHotLeadsImportConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof Error && (/must|invalid|unexpected|required|duplicate|at most|sent_at/i.test(error.message))) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("Instagram hot leads API error", error);
  return NextResponse.json({ error: "Unable to process Instagram hot leads" }, { status: 500 });
}

async function boundedJson(req: NextRequest): Promise<unknown> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > INSTAGRAM_HOT_LEADS_MAX_BODY_BYTES) throw new RangeError("Request body is too large");
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > INSTAGRAM_HOT_LEADS_MAX_BODY_BYTES) throw new RangeError("Request body is too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new SyntaxError("Request body must be valid JSON");
  }
}

export async function GET() {
  try {
    return NextResponse.json(await readInstagramHotLeads());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const incoming = parseInstagramHotLeadsDocument(await boundedJson(req));
    const now = new Date().toISOString();
    const saved = await mutateInstagramHotLeads((current) => replaceInstagramHotLeads(current, incoming, now));
    return NextResponse.json(saved);
  } catch (error) {
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 413 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: error.message }, { status: 400 });
    return errorResponse(error);
  }
}
