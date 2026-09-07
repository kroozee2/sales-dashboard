import { NextRequest, NextResponse } from 'next/server';
import { createLeadsAdminClient } from '@/lib/supabase-leads';

export async function POST(request: NextRequest) {
  const { lead_id, channel } = await request.json() as { lead_id: string; channel: string };
  if (!lead_id || !channel) {
    return NextResponse.json({ error: 'lead_id and channel required' }, { status: 400 });
  }

  const supabase = createLeadsAdminClient();

  // Log the outreach
  const { error: outreachError } = await supabase
    .from('outreaches')
    .insert({ lead_id, channel });

  if (outreachError) {
    return NextResponse.json({ error: outreachError.message }, { status: 500 });
  }

  // Stamp last_update on the lead so Days counter resets
  await supabase
    .from('leads')
    .update({ last_update: new Date().toISOString() })
    .eq('id', lead_id);

  return NextResponse.json({ success: true });
}

export async function GET() {
  const supabase = createLeadsAdminClient();

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Today's count
  const { count: today } = await supabase
    .from('outreaches')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startOfToday);

  // This month's count
  const { count: thisMonth } = await supabase
    .from('outreaches')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startOfMonth);

  // Total ever + first record date for avg calculation
  const { count: total } = await supabase
    .from('outreaches')
    .select('*', { count: 'exact', head: true });

  const { data: firstRow } = await supabase
    .from('outreaches')
    .select('created_at')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  let avgPerDay = 0;
  if (total && firstRow?.created_at) {
    const firstDate = new Date(firstRow.created_at as string);
    const daysSinceFirst = Math.max(1, Math.floor((now.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    avgPerDay = Math.round((total / daysSinceFirst) * 10) / 10;
  }

  return NextResponse.json({
    today: today ?? 0,
    this_month: thisMonth ?? 0,
    total: total ?? 0,
    avg_per_day: avgPerDay,
  });
}
