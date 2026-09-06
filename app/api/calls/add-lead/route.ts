import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

export const runtime = "nodejs";

const HOT_STAGE = "🔥 Hot Prospect";
const HOT_QUALITY = "🔥 Very High";

// POST — turn a sales call into a Leads record under "🔥 Hot Prospect".
// Dedupes on ghl_contact_id / email / phone: if the person is already a lead we
// just promote them to Hot Prospect; otherwise we create a fresh lead.
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as {
    name?: string; email?: string | null; phone?: string | null; ghl_contact_id?: string | null;
    call_type?: string | null; call_date?: string | null; call_notes?: string | null;
    ai_summary?: string | null; objections_notes?: string | null;
  };
  if (!b.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const supabase = createLeadsAdminClient();

  // What we know about them, folded into the lead's notes.
  const today = new Date().toISOString().slice(0, 10);
  const noteLines = [
    `🔥 Added as Hot Prospect from a ${b.call_type || "sales call"} on ${today}.`,
    b.call_date ? `Call date: ${b.call_date}.` : "",
    b.ai_summary ? `Summary: ${b.ai_summary}` : "",
    b.call_notes ? `Notes: ${b.call_notes}` : "",
    b.objections_notes ? `Objections: ${b.objections_notes}` : "",
  ].filter(Boolean);
  const noteBlock = noteLines.join("\n");

  // Look for an existing lead by GHL id, then email, then phone.
  const digits = (b.phone || "").replace(/\D/g, "");
  let existing: { id: string; notes: string | null } | null = null;
  if (b.ghl_contact_id) {
    const { data } = await supabase.from("leads").select("id, notes").eq("ghl_contact_id", b.ghl_contact_id).limit(1).maybeSingle();
    if (data) existing = data;
  }
  if (!existing && b.email) {
    const { data } = await supabase.from("leads").select("id, notes").ilike("email", b.email).limit(1).maybeSingle();
    if (data) existing = data;
  }
  if (!existing && digits.length >= 7) {
    const { data } = await supabase.from("leads").select("id, notes").ilike("phone", `%${digits.slice(-7)}%`).limit(1).maybeSingle();
    if (data) existing = data;
  }

  if (existing) {
    const merged = existing.notes ? `${noteBlock}\n\n${existing.notes}` : noteBlock;
    const { data, error } = await supabase.from("leads")
      .update({ prospect_stage: HOT_STAGE, quality: HOT_QUALITY, notes: merged, last_update: new Date().toISOString() })
      .eq("id", existing.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lead: data, created: false });
  }

  const { data, error } = await supabase.from("leads").insert({
    id: crypto.randomUUID(),
    full_name: b.name.trim(),
    email: b.email || null,
    phone: b.phone || null,
    ghl_contact_id: b.ghl_contact_id || null,
    prospect_stage: HOT_STAGE,
    quality: HOT_QUALITY,
    source: "Sales Call",
    notes: noteBlock,
    opt_in_date: new Date().toISOString(),
    last_update: new Date().toISOString(),
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lead: data, created: true });
}
