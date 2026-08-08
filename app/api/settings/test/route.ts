import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { integration, values } = await req.json() as {
    integration: string;
    values: Record<string, string>;
  };

  try {
    switch (integration) {
      case 'anthropic': {
        const key = values.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '';
        if (!key) return NextResponse.json({ ok: false, message: 'No API key provided.' });
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        });
        if (res.ok) return NextResponse.json({ ok: true, message: 'Claude API connected.' });
        return NextResponse.json({ ok: false, message: `Auth failed (${res.status}). Check your API key.` });
      }

      case 'stripe': {
        const key = values.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';
        if (!key) return NextResponse.json({ ok: false, message: 'No Stripe secret key provided.' });
        const res = await fetch('https://api.stripe.com/v1/balance', {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (res.ok) return NextResponse.json({ ok: true, message: 'Stripe connected.' });
        return NextResponse.json({ ok: false, message: `Auth failed (${res.status}). Check your Stripe secret key.` });
      }

      case 'ghl': {
        const apiKey = values.GHL_API_KEY || process.env.GHL_API_KEY || '';
        const locationId = values.GHL_LOCATION_ID || process.env.GHL_LOCATION_ID || '';
        if (!apiKey) return NextResponse.json({ ok: false, message: 'No GHL API key provided.' });
        if (!locationId) return NextResponse.json({ ok: false, message: 'No Location ID provided.' });
        const res = await fetch(
          `https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&limit=1`,
          { headers: { Authorization: `Bearer ${apiKey}`, Version: '2021-07-28' } }
        );
        if (res.ok) return NextResponse.json({ ok: true, message: 'GoHighLevel connected.' });
        return NextResponse.json({ ok: false, message: `Auth failed (${res.status}). Check your API key and Location ID.` });
      }

      case 'calendar': {
        const url = values.GOOGLE_CALENDAR_ICAL_URL || process.env.GOOGLE_CALENDAR_ICAL_URL || '';
        if (!url) return NextResponse.json({ ok: false, message: 'No iCal URL provided.' });
        const res = await fetch(url, { headers: { Accept: 'text/calendar, */*' }, cache: 'no-store' });
        if (!res.ok) return NextResponse.json({ ok: false, message: `Could not fetch URL (${res.status}).` });
        const text = await res.text();
        if (text.includes('BEGIN:VCALENDAR')) return NextResponse.json({ ok: true, message: 'Google Calendar connected.' });
        return NextResponse.json({ ok: false, message: 'URL fetched but does not look like a valid iCal feed.' });
      }

      default:
        return NextResponse.json({ ok: false, message: 'Unknown integration.' });
    }
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) });
  }
}
