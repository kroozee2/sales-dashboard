import { NextRequest, NextResponse } from 'next/server';
import { createLeadsAdminClient } from '@/lib/supabase-leads';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createLeadsAdminClient();
  const { data, error } = await supabase.from('leads').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createLeadsAdminClient();

  // Delete associated notes first
  await supabase.from('lead_notes').delete().eq('lead_id', id);

  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
