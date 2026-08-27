import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_MESSAGING_DOCUMENT } from "@/lib/messaging-default";
import {
  parseMessagingDocument,
  readBoundedRequestBody,
  updateMessagingDocument,
} from "@/lib/messaging";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { invalidateSettings } from "@/lib/settings";

export const MESSAGING_BIBLE_KEY = "MESSAGING_BIBLE_V1";
const MAX_REQUEST_BYTES = 180_000;

export async function GET() {
  const db = createLeadsAdminClient();
  const { data, error } = await db
    .from("settings")
    .select("value")
    .eq("key", MESSAGING_BIBLE_KEY)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.value) return NextResponse.json({ document: DEFAULT_MESSAGING_DOCUMENT });

  try {
    return NextResponse.json({ document: parseMessagingDocument(String(data.value)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stored messaging document is invalid";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Messaging document is too large" }, { status: 413 });
  }

  let raw: string;
  try {
    raw = await readBoundedRequestBody(req, MAX_REQUEST_BYTES);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Messaging document is too large";
    return NextResponse.json({ error: message }, { status: 413 });
  }

  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (!input || typeof input !== "object" || !("expected_revision" in input)) {
    return NextResponse.json({ error: "expected_revision is required" }, { status: 400 });
  }

  const db = createLeadsAdminClient();
  const { data: stored, error: readError } = await db
    .from("settings")
    .select("value, updated_at")
    .eq("key", MESSAGING_BIBLE_KEY)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  let current = DEFAULT_MESSAGING_DOCUMENT;
  try {
    if (stored?.value) current = parseMessagingDocument(String(stored.value));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stored messaging document is invalid";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let next;
  try {
    next = updateMessagingDocument(
      current,
      input,
      new Date().toISOString(),
      stored?.updated_at ?? current.revision,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid messaging document";
    const status = /stale/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  if (stored) {
    let query = db
      .from("settings")
      .update({ value: JSON.stringify(next), updated_at: next.updated_at })
      .eq("key", MESSAGING_BIBLE_KEY);
    query = stored.updated_at
      ? query.eq("updated_at", stored.updated_at)
      : query.is("updated_at", null);
    const { data, error } = await query.select("key").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) {
      return NextResponse.json(
        { error: "Messaging changed in another tab. Reload before saving again." },
        { status: 409 },
      );
    }
  } else {
    const { error } = await db.from("settings").insert({
      key: MESSAGING_BIBLE_KEY,
      value: JSON.stringify(next),
      updated_at: next.updated_at,
    });
    if (error) {
      const status = error.code === "23505" ? 409 : 500;
      return NextResponse.json({ error: status === 409 ? "Messaging was created in another tab. Reload and try again." : error.message }, { status });
    }
  }

  invalidateSettings();
  return NextResponse.json({ document: next });
}
