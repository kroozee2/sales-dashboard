import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type AirtableRecord = {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
};

export async function POST() {
  const pat = process.env.AIRTABLE_PAT!;
  const base = process.env.AIRTABLE_SCALE_OS_BASE ?? 'appPqR5QXRBoqTZCX';
  const table = 'tblxm4EJxWNzOkm2t'; // OffersOS

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
    process.env.SUPABASE_CALLS_SERVICE_KEY!
  );

  const allRecords: AirtableRecord[] = [];
  let offset: string | undefined;

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
      return NextResponse.json({ error: `Airtable fetch failed: ${err}` }, { status: 500 });
    }
    const data = await res.json() as { records: AirtableRecord[]; offset?: string };
    allRecords.push(...data.records);
    offset = data.offset;
  } while (offset);

  const now = new Date().toISOString();
  const rows = allRecords.map((r) => {
    const f = r.fields;
    return {
      id: r.id,
      airtable_id: r.id,
      name: (f['fldCnQ8UoIBHzXi6q'] as string) ?? null,
      offer_type: (f['fldcsjoiAmzvnh0Nt'] as string) ?? null,
      selling: (f['fldP3JdoErJOb2gmD'] as string) ?? null,
      status: (f['flduItUakEuqPgzHu'] as string) ?? null,
      length: (f['fldRaPxv3EImuej5L'] as string) ?? null,
      pif_price: (f['fldk9ueE6q2xQW52a'] as number) ?? null,
      pp_down: (f['fldR1xHWRmMXdJibz'] as number) ?? null,
      pp_price: (f['fldaDQs6X4UBplIsn'] as number) ?? null,
      spots_available: (f['fld894jeHxBECy2rv'] as number) ?? null,
      start_date: (f['fldO47HTw7shLu784'] as string) ?? null,
      pif_link: (f['fldyjFzT0OWXnREf4'] as string) ?? null,
      pp_link: (f['fldXTDgN5mV5hLaVW'] as string) ?? null,
      payment_link: (f['fldMxsPl9Cs9WRUct'] as string) ?? null,
      sales_page: (f['fldnZFlAM6eDtqQpD'] as string) ?? null,
      purchase_page: (f['fld1xH2RKMQLosqro'] as string) ?? null,
      offer_1_sheeter: (f['fldPECSD29n1PwJRp'] as string) ?? null,
      onboarding_link: (f['fldiArVS064H7MKSD'] as string) ?? null,
      revenue: (f['fldGt0c3qwX2XPMfk'] as number) ?? null,
      num_sales: (f['fld1kkR1IvREFoD6n'] as number) ?? null,
      target_revenue: (f['fldPHmQUaH0cvn9pk'] as number) ?? null,
      enrollment_target: (f['fldLlS9sfknlOgQ0u'] as number) ?? null,
      avatar: (f['fldEvMnxkun0gxl7R'] as string) ?? null,
      pain: (f['fldwZlP6m9jFv0O7D'] as string) ?? null,
      fear: (f['fldBKBELkoT0xoJ9S'] as string) ?? null,
      desire: (f['fldCEChtWCiwdtyUp'] as string) ?? null,
      promise: (f['fldqSTacpzgHONlUV'] as string) ?? (f['fldqSTacpzgHONlUV'] as string) ?? null,
      dm_copy: (f['fldN2iS8WA5Y26H3U'] as string) ?? null,
      launch_post: (f['fldaHW3hCLE3UwSji'] as string) ?? null,
      synced_at: now,
    };
  });

  let count = 0;
  let errors = 0;
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('offers').upsert(batch, { onConflict: 'id' });
    if (error) { console.error(error.message); errors += batch.length; }
    else count += batch.length;
  }

  return NextResponse.json({ count, errors, total: allRecords.length });
}
