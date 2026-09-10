import { NextRequest, NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";
import { generateReelScript } from "@/lib/content";
import { CTA_LINES, isScriptCategory, normalizeSteps } from "@/lib/reel-scripts";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Draft a script's Hook / Show / CTA.
 *
 * The draft is written straight onto the row so the sidebar can just re-render
 * what came back. Everything is still editable afterwards — this is a starting
 * point Andrew rewrites, not a finished script.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }); }

  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = contentDb();
  const { data: script, error: readError } = await db
    .from("reel_scripts").select("*").eq("id", id).maybeSingle();
  if (readError || !script) return NextResponse.json({ error: "Script not found" }, { status: 404 });

  let draft;
  try {
    draft = await generateReelScript({
      title: script.title,
      category: isScriptCategory(script.category) ? script.category : "value",
      sourceNote: script.source_note,
      // A hook Andrew has already typed is an instruction, not a leftover:
      // keep his angle rather than writing over it.
      hookSoFar: typeof script.hook === "string" && script.hook.trim() ? script.hook : null,
      notes: typeof body.notes === "string" ? body.notes.slice(0, 2000) : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: `Could not write the script: ${message}` }, { status: 502 });
  }

  if (!draft.hook && draft.steps.length === 0) {
    return NextResponse.json({ error: "The model came back empty. Try again." }, { status: 502 });
  }

  const update = {
    hook: draft.hook || script.hook,
    steps: normalizeSteps(draft.steps),
    cta: draft.cta || CTA_LINES[draft.cta_kind],
    cta_kind: draft.cta_kind,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from("reel_scripts").update(update).eq("id", id).select().maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Wrote the script but could not save it" }, { status: 500 });
  return NextResponse.json({ script: data });
}
