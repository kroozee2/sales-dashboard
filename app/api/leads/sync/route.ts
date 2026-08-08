import { NextResponse } from 'next/server';
import { syncLeadsFromAirtable } from '@/lib/sync-leads';

export async function POST() {
  try {
    const { count, errors } = await syncLeadsFromAirtable();
    return NextResponse.json({ success: true, count, errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
