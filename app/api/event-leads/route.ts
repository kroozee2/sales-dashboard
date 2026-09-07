import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_CALLS_ANON_KEY!
);

// Only these can be written from the browser — the ticket facts that come from
// the event app stay read-only here.
const EDITABLE = ["pitch_offer", "owner", "potential_revenue", "outcome", "notes"] as const;

// GET — the ticket buyers for an event, plus the live offer list for the
// "what are we pitching them" dropdown.
export async function GET(req: NextRequest) {
  const eventKey = new URL(req.url).searchParams.get("event") ?? "miami-2026";

  const [{ data: leads, error }, { data: offers }] = await Promise.all([
    db.from("event_leads").select("*").eq("event_key", eventKey).order("name", { ascending: true }),
    db.from("offer_briefs").select("id,name,emoji").eq("archived", false).order("sort_order", { ascending: true }),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ leads: leads ?? [], offers: offers ?? [] });
}

// PATCH — edit one row's pitch offer / owner / potential revenue / outcome.
export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as { id?: string } & Record<string, unknown>;
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE) if (k in body) updates[k] = body[k];
  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await db.from("event_leads").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
