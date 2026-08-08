import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY!
);

// Accepts a base64-encoded audio recording, stores it in the public
// `voice-notes` bucket, and returns the public URL.
export async function POST(req: NextRequest) {
  const { audioBase64, ext } = await req.json() as { audioBase64: string; ext?: string };
  if (!audioBase64) return NextResponse.json({ error: "audioBase64 required" }, { status: 400 });

  const b64 = audioBase64.includes(",") ? audioBase64.split(",")[1] : audioBase64;
  const buffer = Buffer.from(b64, "base64");
  const extension = (ext || "webm").replace(/[^a-z0-9]/gi, "");
  const contentType = extension === "mp4" ? "audio/mp4" : extension === "mp3" ? "audio/mpeg" : "audio/webm";
  const path = `${crypto.randomUUID()}.${extension}`;

  const { error } = await db().storage.from("voice-notes").upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = db().storage.from("voice-notes").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
