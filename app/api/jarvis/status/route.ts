import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    cartesiaConfigured: Boolean(process.env.CARTESIA_API_KEY && process.env.CARTESIA_VOICE_ID),
    capabilities: [
      'SalesOS leads and pipeline',
      'Sales calls and Fathom recordings',
      'GoHighLevel contacts',
      'Message drafting',
    ],
  });
}
