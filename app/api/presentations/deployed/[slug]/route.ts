import { NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { getDeployedPresentation, parsePresentationsDocument } from "@/lib/presentations";

const PRESENTATIONS_KEY = "PRESENTATIONS_V1";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (slug.length > 80 || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "Presentation not found" }, { status: 404 });
  }
  const db = createLeadsAdminClient();
  const { data: stored, error } = await db
    .from("settings")
    .select("value")
    .eq("key", PRESENTATIONS_KEY)
    .maybeSingle();
  if (error) {
    console.error("Deployed presentation storage failure", { context: "read", code: typeof error.code === "string" ? error.code.slice(0, 32) : "unknown" });
    return NextResponse.json({ error: "Presentation is temporarily unavailable" }, { status: 500 });
  }
  if (!stored?.value) return NextResponse.json({ error: "Presentation not found" }, { status: 404 });
  try {
    const snapshot = getDeployedPresentation(parsePresentationsDocument(String(stored.value)), slug);
    if (!snapshot) return NextResponse.json({ error: "Presentation not found" }, { status: 404 });
    return NextResponse.json(
      { presentation: { slug, ...snapshot } },
      { headers: { "cache-control": "public, max-age=0, must-revalidate", "x-content-type-options": "nosniff" } },
    );
  } catch {
    console.error("Stored deployed presentation failed validation", { context: "read" });
    return NextResponse.json({ error: "Presentation is temporarily unavailable" }, { status: 500 });
  }
}
