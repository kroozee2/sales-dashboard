import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

// The running partner list, migrated out of the Flow app. Flow kept its AI
// research in the browser's localStorage, so none of it survived the move --
// research here is stored on the row so every device and every agent sees it.

export const runtime = "nodejs";

const EDITABLE = [
  "name", "title", "company", "industry", "website", "linkedin", "instagram", "facebook",
  "email", "phone", "paypal_email", "bio", "headshot_url",
  "partner_scorecard", "partnership_strength", "partnership_status", "opportunity_types", "notes",
] as const;

export async function GET() {
  const { data, error } = await createLeadsAdminClient()
    .from("jv_partners").select("*").order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partners: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const row: Record<string, unknown> = { source: "salesos" };
  for (const k of EDITABLE) if (k in body) row[k] = body[k];
  const { data, error } = await createLeadsAdminClient()
    .from("jv_partners").insert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partner: data });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = body.id as string | undefined;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE) if (k in body) patch[k] = body[k];
  const { data, error } = await createLeadsAdminClient()
    .from("jv_partners").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partner: data });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const { error } = await createLeadsAdminClient().from("jv_partners").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
