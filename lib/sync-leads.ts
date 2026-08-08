// Stage mapping
const STAGE_MAP: Record<string, string> = {
  '📞 Enrollment Call Booked': '📞 Call Booked',
  '☎️ Triage Call Booked': '📞 Call Booked',
  '📅 Booking Link Sent': '🔗 Pay Link Sent',
  '💰 Deposit Collected': '🏦 Payment Received',
};

function mapStage(stage: string): string {
  return STAGE_MAP[stage] ?? stage;
}

// Fetches all records from Airtable and upserts to Supabase
// Returns { count, errors }
export async function syncLeadsFromAirtable(): Promise<{ count: number; errors: number }> {
  const pat = process.env.AIRTABLE_PAT!;
  const base = process.env.AIRTABLE_LEADS_BASE!;
  const table = process.env.AIRTABLE_LEADS_TABLE!;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!;
  const supabaseServiceKey = process.env.SUPABASE_CALLS_SERVICE_KEY!;

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const allRecords: AirtableRecord[] = [];
  let offset: string | undefined;

  // Paginate through all Airtable records
  do {
    const url = new URL(`https://api.airtable.com/v0/${base}/${table}`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('returnFieldsByFieldId', 'true');
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${pat}` },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Airtable fetch failed: ${err}`);
    }

    const data = await res.json() as { records: AirtableRecord[]; offset?: string };
    allRecords.push(...data.records);
    offset = data.offset;
    console.log(`Fetched ${allRecords.length} records so far...`);
  } while (offset);

  console.log(`Total records fetched: ${allRecords.length}`);

  // Map to Supabase rows
  const now = new Date().toISOString();
  const rows = allRecords.map((record) => {
    const f = record.fields;
    const stage = typeof f['fldDRBIDhEti8KL4v'] === 'string' ? mapStage(f['fldDRBIDhEti8KL4v']) : null;

    return {
      id: record.id,
      airtable_id: record.id,
      full_name: (f['fldva6wF4Hd76GD1N'] as string) ?? null,
      email: (f['fldm0dcaX8irf2A32'] as string) ?? null,
      phone: (f['fldpIWkN5KmwSbnN5'] as string) ?? null,
      social_url: (f['fldMItuAMpcDV9wni'] as string) ?? null,
      prospect_stage: stage,
      quality: (f['fldvcpQuv6mRqUy7N'] as string) ?? null,
      source: (f['fldFthJBfD1RmRuOL'] as string) ?? null,
      revenue_level: (f['fldcdBbJv9b2MNdYx'] as string) ?? null,
      notes: (f['fldeysmwQOExEldVI'] as string) ?? null,
      ongoing_message_feed: (f['fldwB3eTU5zyXsFAR'] as string) ?? null,
      ghl_contact_id: (f['fld86vOHV4csTZUsE'] as string) ?? null,
      ghl_url: null as string | null,
      setter: (f['fldne9omQzVxk40ZM'] as { name?: string } | null)?.name ?? null,
      sales_person: (f['fldM5eaPuv0Am0FBG'] as { name?: string } | null)?.name ?? null,
      tags: [] as string[],
      opt_in_date: (f['fld55OQrmz6HlUJqp'] as string) ?? null,
      last_update: (f['fldekeAaNyB17cLI5'] as string) ?? null,
      created_at: record.createdTime ?? null,
      synced_at: now,
    };
  });

  // Upsert in batches of 500.
  // For EXISTING records, do NOT overwrite prospect_stage — let the dashboard own that field.
  // New records get their initial stage from Airtable.
  let count = 0;
  let errors = 0;
  const BATCH = 500;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);

    // Find which IDs already exist so we can preserve their prospect_stage
    const { data: existingRows } = await supabase
      .from('leads')
      .select('id')
      .in('id', batch.map((r) => r.id));
    const existingIds = new Set((existingRows ?? []).map((r) => (r as { id: string }).id));

    // Remove prospect_stage from update payload for existing records
    const upsertBatch = batch.map((row) => {
      if (existingIds.has(row.id)) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { prospect_stage, ...rest } = row;
        return rest;
      }
      return row;
    });

    const { error } = await supabase
      .from('leads')
      .upsert(upsertBatch, { onConflict: 'id' });

    if (error) {
      console.error(`Error upserting batch starting at ${i}:`, error.message);
      errors += batch.length;
    } else {
      count += batch.length;
      console.log(`Upserted batch ${Math.floor(i / BATCH) + 1} (${count}/${rows.length})`);
    }
  }

  return { count, errors };
}

type AirtableRecord = {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
};
