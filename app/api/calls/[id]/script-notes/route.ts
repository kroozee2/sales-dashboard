import { NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createLeadsAdminClient();
  const { data, error } = await supabase
    .from("call_section_notes")
    .select("*")
    .eq("call_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: data ?? [] });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { section_id, notes, fathom_excerpt } = await req.json();
  const supabase = createLeadsAdminClient();
  const { data, error } = await supabase
    .from("call_section_notes")
    .upsert(
      { call_id: id, section_id, notes, fathom_excerpt, updated_at: new Date().toISOString() },
      { onConflict: "call_id,section_id" }
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}
