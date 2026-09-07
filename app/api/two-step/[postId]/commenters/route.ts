import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY!
);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const client = db();
  const { data: commenters, error } = await client
    .from("two_step_commenters")
    .select("*")
    .eq("post_id", postId)
    .order("matched", { ascending: false })
    .order("commented_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich matched commenters with their lead's phone/ghl for one-tap send
  const leadIds = (commenters ?? []).map((c) => c.lead_id).filter(Boolean) as string[];
  const leadMap: Record<string, { phone: string | null; ghl_contact_id: string | null; prospect_stage: string | null }> = {};
  if (leadIds.length) {
    const { data: leads } = await client.from("leads").select("id, phone, ghl_contact_id, prospect_stage").in("id", leadIds);
    for (const l of leads ?? []) leadMap[l.id] = { phone: l.phone, ghl_contact_id: l.ghl_contact_id, prospect_stage: l.prospect_stage };
  }
  const enriched = (commenters ?? []).map((c) => ({ ...c, lead: c.lead_id ? leadMap[c.lead_id] ?? null : null }));
  return NextResponse.json({ commenters: enriched });
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json() as { id: string; status: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await db().from("two_step_commenters").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
