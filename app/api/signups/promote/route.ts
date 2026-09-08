import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

// Opening a signup opens it as a real lead, the same as New Leads does, so the
// full Leads drawer (Connect, Message, Notes, AI) works on them. Matched on
// email so a second open updates rather than duplicates.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as {
    name?: string; email?: string; phone?: string; source?: string; created_at?: string; stage?: string;
  };
  const email = (b.email ?? "").trim();
  const name = (b.name ?? "").trim() || email.split("@")[0];
  if (!email && !name) return NextResponse.json({ error: "This signup has no email or name to work from." }, { status: 400 });

  const db = createLeadsAdminClient();
  if (email) {
    const { data: existing } = await db.from("leads").select("*").ilike("email", email).maybeSingle();
    if (existing) return NextResponse.json({ ok: true, lead: existing, created: false });
  }

  // A phone that isn't a phone is worse than none — some apps store junk here.
  const digits = (b.phone ?? "").replace(/\D/g, "");
  const phone = digits.length >= 7 ? (b.phone as string) : null;

  const { data, error } = await db.from("leads").insert({
    id: crypto.randomUUID(),
    full_name: name,
    email: email || null,
    phone,
    prospect_stage: b.stage ?? "👨 Prospect",
    source: b.source ?? null,
    created_at: b.created_at ?? new Date().toISOString(),
    last_update: new Date().toISOString(),
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, lead: data, created: true });
}
