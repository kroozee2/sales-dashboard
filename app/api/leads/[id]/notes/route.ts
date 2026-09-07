import { NextRequest, NextResponse } from 'next/server';
import { createLeadsAdminClient } from '@/lib/supabase-leads';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createLeadsAdminClient();

  const { data, error } = await supabase
    .from('lead_notes')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: data });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { text } = await req.json() as { text: string };
  if (!text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 });

  const supabase = createLeadsAdminClient();

  const { data: note, error: noteError } = await supabase
    .from('lead_notes')
    .insert({ lead_id: id, text: text.trim() })
    .select()
    .single();

  if (noteError) return NextResponse.json({ error: noteError.message }, { status: 500 });

  // Update last_update on the lead
  await supabase
    .from('leads')
    .update({ last_update: new Date().toISOString() })
    .eq('id', id);

  return NextResponse.json({ note });
}

export async function DELETE(req: NextRequest) {
  const { noteId } = await req.json() as { noteId: string };
  const supabase = createLeadsAdminClient();
  await supabase.from('lead_notes').delete().eq('id', noteId);
  return NextResponse.json({ ok: true });
}
