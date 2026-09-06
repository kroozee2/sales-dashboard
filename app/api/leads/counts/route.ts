import { NextResponse } from 'next/server';
import { createLeadsAdminClient } from '@/lib/supabase-leads';

export async function GET() {
  const supabase = createLeadsAdminClient();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [totalRes, hotRes, callRes, monthRes] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact', head: true }),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('prospect_stage', '🔥 Hot Prospect'),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('prospect_stage', '📞 Call Booked'),
    supabase.from('leads').select('*', { count: 'exact', head: true }).gte('opt_in_date', startOfMonth),
  ]);

  if (totalRes.error || hotRes.error || callRes.error || monthRes.error) {
    const err = totalRes.error ?? hotRes.error ?? callRes.error ?? monthRes.error;
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }

  return NextResponse.json({
    total: totalRes.count ?? 0,
    hot: hotRes.count ?? 0,
    call: callRes.count ?? 0,
    month: monthRes.count ?? 0,
  });
}
