import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import {
  isCompetitorPayloadWithinLimits,
  normalizeCompetitorResearch,
  parseCompetitorResearch,
  upsertCompetitorResearch,
} from "@/lib/content-competitors";

const SETTINGS_KEY = "CONTENT_COMPETITOR_RESEARCH";
const MAX_WRITE_ATTEMPTS = 3;

export async function GET() {
  const { data, error } = await createLeadsAdminClient()
    .from("settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ creators: parseCompetitorResearch(data?.value) });
}

// Atomically upsert one creator. The compare-and-swap condition prevents a
// stale browser tab from replacing research saved by another tab or agent.
export async function PATCH(req: NextRequest) {
  const body = await req.json() as { creator?: unknown };
  const creator = normalizeCompetitorResearch(body.creator);
  if (!creator || !isCompetitorPayloadWithinLimits([creator])) {
    return NextResponse.json({ error: "valid creator required" }, { status: 400 });
  }

  const db = createLeadsAdminClient();
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const { data: currentRow, error: readError } = await db
      .from("settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

    const currentRaw = typeof currentRow?.value === "string" ? currentRow.value : null;
    const creators = upsertCompetitorResearch(parseCompetitorResearch(currentRaw), creator);
    const nextRaw = JSON.stringify(creators);
    const write = {
      key: SETTINGS_KEY,
      value: nextRaw,
      updated_at: new Date().toISOString(),
    };

    if (currentRaw === null) {
      const { data: inserted, error: insertError } = await db
        .from("settings")
        .insert(write)
        .select("value")
        .maybeSingle();
      if (inserted) return NextResponse.json({ creators });
      if (insertError?.code !== "23505") {
        return NextResponse.json({ error: insertError?.message || "Could not save research" }, { status: 500 });
      }
      continue;
    }

    const { data: updated, error: updateError } = await db
      .from("settings")
      .update(write)
      .eq("key", SETTINGS_KEY)
      .eq("value", currentRaw)
      .select("value")
      .maybeSingle();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    if (updated) return NextResponse.json({ creators });
  }

  return NextResponse.json({ error: "Research changed elsewhere. Please retry." }, { status: 409 });
}
