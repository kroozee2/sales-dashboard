import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";

export const runtime = "nodejs";
export const maxDuration = 120;
const BUCKET = "resource-media";
const MAX_BYTES = 50 * 1024 * 1024; // 50MB — covers phone screenshots and short videos

// Upload a screenshot or video for idea capture / proof, return its public URL
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 50MB). For long videos, trim it or upload a screenshot." }, { status: 400 });
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `content/${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const db = contentDb();
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: file.type || "image/png", upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
