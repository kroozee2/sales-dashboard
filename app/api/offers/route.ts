import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
    process.env.SUPABASE_CALLS_SERVICE_KEY!
  );
}

export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ offers: data ?? [] });
}

export async function DELETE(req: Request) {
  const { id } = await req.json() as { id: string };
  const supabase = getSupabase();
  const { error } = await supabase.from('offers').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PATCH(req: Request) {
  const body = await req.json() as Record<string, unknown> & { id: string };
  const { id, ...updates } = body;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('offers')
    .update({ ...updates, synced_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mirror selling/status back to Airtable
  const pat = process.env.AIRTABLE_PAT;
  if (pat && (updates.selling !== undefined || updates.status !== undefined)) {
    const base = process.env.AIRTABLE_LEADS_BASE!;
    const fields: Record<string, unknown> = {};
    if (updates.selling !== undefined) fields['fldP3JdoErJOb2gmD'] = updates.selling;
    if (updates.status !== undefined) fields['flduItUakEuqPgzHu'] = updates.status;
    await fetch(`https://api.airtable.com/v0/${base}/tblxm4EJxWNzOkm2t/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields, returnFieldsByFieldId: true }),
    }).catch(() => null);
  }

  return NextResponse.json({ offer: data });
}
