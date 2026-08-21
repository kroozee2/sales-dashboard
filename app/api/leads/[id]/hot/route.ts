import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { ghlCreateContact } from "@/lib/ghl-inbox";
import { HotLeadsStoreConflictError, mutateHotInstagram } from "@/lib/hot-leads-store";

export const runtime = "nodejs";

// Flag a lead as a Hot prospect. If they have a phone or email but no
// GoHighLevel contact yet, create one so connected messaging remains available.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createLeadsAdminClient();
  const { data: lead } = await db.from("leads").select("full_name, email, phone, ghl_contact_id").eq("id", id).single();
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });

  let ghlContactId = lead.ghl_contact_id as string | null;
  const reachable = !!(lead.email || lead.phone);
  if (!ghlContactId && reachable) ghlContactId = await ghlCreateContact(lead.full_name ?? "Lead", lead.email ?? null, lead.phone ?? null);

  const { error } = await db.from("leads").update({ hot: true, hot_at: new Date().toISOString(), ...(ghlContactId ? { ghl_contact_id: ghlContactId } : {}) }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ hot: true, ghl_contact_id: ghlContactId, reachable });
}

class HotLeadSendInFlightError extends Error {}

// Revoke any queued Instagram approval before removing the native lead from Hot.
// A sending row blocks removal, closing the removal/send race without risking an
// uncertain provider outcome. The stage update is compare-and-set so it cannot
// overwrite a concurrent pipeline move.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createLeadsAdminClient();
  const { data: lead, error: readError } = await db.from("leads").select("prospect_stage").eq("id", id).single();
  if (readError || !lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });

  try {
    await mutateHotInstagram((current) => {
      const context = current.contexts.find((row) => row.lead_id === id);
      if (context?.status === "sending") throw new HotLeadSendInFlightError("Instagram message is already sending; wait for it to finish before removing this lead");
      return { ...current, contexts: current.contexts.filter((row) => row.lead_id !== id) };
    });
  } catch (error) {
    if (error instanceof HotLeadSendInFlightError || error instanceof HotLeadsStoreConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Unable to revoke Hot lead Instagram approval", error);
    return NextResponse.json({ error: "Unable to safely remove this lead from Hot" }, { status: 500 });
  }

  const updates: { hot: boolean; prospect_stage?: string; last_update: string } = lead.prospect_stage === "🔥 Hot Prospect"
    ? { hot: false, prospect_stage: "👨 Prospect", last_update: new Date().toISOString() }
    : { hot: false, last_update: new Date().toISOString() };
  let update = db.from("leads").update(updates).eq("id", id);
  update = lead.prospect_stage === null ? update.is("prospect_stage", null) : update.eq("prospect_stage", lead.prospect_stage);
  const { data: saved, error } = await update.select("prospect_stage").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!saved) return NextResponse.json({ error: "Lead changed while being removed. Refresh and try again." }, { status: 409 });
  return NextResponse.json({ hot: false, prospect_stage: saved.prospect_stage });
}
