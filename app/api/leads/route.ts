import { NextRequest, NextResponse } from 'next/server';
import { createLeadsAdminClient } from '@/lib/supabase-leads';

// Reverse map display stage back to first matching Airtable stage for updates
const DISPLAY_TO_AIRTABLE_STAGE: Record<string, string> = {
  '📞 Call Booked': '📞 Enrollment Call Booked',
  '🔗 Pay Link Sent': '🔗 Pay Link Sent',
  '🏦 Payment Received': '🏦 Payment Received',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') ?? '';
  const stage = searchParams.get('stage') ?? '';
  const quality = searchParams.get('quality') ?? '';
  const source = searchParams.get('source') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') ?? '100', 10)));

  const supabase = createLeadsAdminClient();
  const from = (page - 1) * limit;

  let query = supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .order('last_update', { ascending: false, nullsFirst: false })
    .range(from, from + limit - 1);

  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,notes.ilike.%${search}%`
    );
  }
  if (stage) {
    query = query.eq('prospect_stage', stage);
  }
  if (quality) {
    query = query.eq('quality', quality);
  }
  if (source) {
    query = query.eq('source', source);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? 0;
  const hasMore = from + limit < total;

  return NextResponse.json({ leads: data ?? [], total, page, hasMore });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    full_name: string;
    email?: string;
    phone?: string;
    prospect_stage?: string;
    quality?: string;
    source?: string;
    notes?: string;
    ghl_contact_id?: string;
    instagram_url?: string;
    facebook_url?: string;
    linkedin_url?: string;
    social_url?: string;
    revenue_level?: string;
    follow_up_date?: string;
  };

  if (!body.full_name) {
    return NextResponse.json({ error: 'full_name required' }, { status: 400 });
  }

  const supabase = createLeadsAdminClient();
  const { data, error } = await supabase
    .from('leads')
    .insert({
      id: crypto.randomUUID(),
      full_name: body.full_name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      prospect_stage: body.prospect_stage ?? '👨 Prospect',
      quality: body.quality ?? null,
      source: body.source ?? null,
      notes: body.notes ?? null,
      ghl_contact_id: body.ghl_contact_id ?? null,
      instagram_url: body.instagram_url ?? null,
      facebook_url: body.facebook_url ?? null,
      linkedin_url: body.linkedin_url ?? null,
      social_url: body.social_url ?? null,
      revenue_level: body.revenue_level ?? null,
      follow_up_date: body.follow_up_date ?? null,
      opt_in_date: new Date().toISOString(),
      last_update: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lead: data });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json() as {
    id: string;
    prospect_stage?: string;
    notes?: string;
  };

  const { id, ...updates } = body;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const supabase = createLeadsAdminClient();
  const { data, error } = await supabase
    .from('leads')
    .update({ ...updates, last_update: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If stage changed, sync to Airtable
  if (updates.prospect_stage) {
    const airtableStage = DISPLAY_TO_AIRTABLE_STAGE[updates.prospect_stage] ?? updates.prospect_stage;
    try {
      await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_LEADS_BASE}/${process.env.AIRTABLE_LEADS_TABLE}/${id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${process.env.AIRTABLE_PAT}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: { fldDRBIDhEti8KL4v: airtableStage },
          }),
        }
      );
    } catch (airtableErr) {
      console.error('Airtable sync error (non-fatal):', airtableErr);
    }
  }

  return NextResponse.json({ lead: data });
}
