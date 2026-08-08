import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { ghlCreateContact } from "@/lib/ghl-inbox";

export const runtime = "nodejs";

// Flag a lead as a Hot prospect (for the Messages → Hot tab). If they have a
// phone or email but no GoHighLevel contact yet, create one so we can text /
// email them directly from Messages.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createLeadsAdminClient();
  const { data: lead } = await db
    .from("leads")
    .select("full_name, email, phone, ghl_contact_id")
    .eq("id", id)
    .single();
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });

  let ghlContactId = lead.ghl_contact_id as string | null;
  const reachable = !!(lead.email || lead.phone);
  if (!ghlContactId && reachable) {
    ghlContactId = await ghlCreateContact(lead.full_name ?? "Lead", lead.email ?? null, lead.phone ?? null);
  }

  const { error } = await db
    .from("leads")
    .update({ hot: true, hot_at: new Date().toISOString(), ...(ghlContactId ? { ghl_contact_id: ghlContactId } : {}) })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ hot: true, ghl_contact_id: ghlContactId, reachable });
}

// Remove from Hot.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createLeadsAdminClient();
  const { error } = await db.from("leads").update({ hot: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ hot: false });
}
