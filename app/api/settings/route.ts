import { NextRequest, NextResponse } from 'next/server';
import { createLeadsAdminClient } from '@/lib/supabase-leads';
import { invalidateSettings } from '@/lib/settings';

export async function GET() {
  const supabase = createLeadsAdminClient();
  const { data, error } = await supabase.from('settings').select('key, value');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key as string] = row.value as string;
  return NextResponse.json({ settings: map });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json() as Record<string, string>;
  const supabase = createLeadsAdminClient();
  const upserts = Object.entries(body).map(([key, value]) => ({
    key,
    value,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('settings').upsert(upserts, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateSettings();
  return NextResponse.json({ ok: true });
}
