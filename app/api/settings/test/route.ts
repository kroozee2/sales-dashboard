import { NextRequest, NextResponse } from 'next/server';
import { currentMember, identitySigningConfiguredWithSettings } from '@/lib/team-auth';
import { parseJsonWithUniqueKeys } from '@/lib/agent-workforce';

const MAX_BODY_BYTES = 16_384;
const ALLOWED_FIELDS: Record<string, readonly string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  stripe: ['STRIPE_SECRET_KEY'],
  ghl: ['GHL_API_KEY', 'GHL_LOCATION_ID'],
  calendar: ['GOOGLE_CALENDAR_ICAL_URL'],
};

async function requireOwner(req: NextRequest) {
  if (!await identitySigningConfiguredWithSettings()) return NextResponse.json({ error: 'Owner identity service unavailable.' }, { status: 503 });
  const member = await currentMember(req.cookies.get('sos_user')?.value);
  if (!member) return NextResponse.json({ error: 'Sign in with an owner account.' }, { status: 401 });
  if (!member.active || member.role !== 'owner') return NextResponse.json({ error: 'Only an active owner can test settings.' }, { status: 403 });
  return null;
}

async function readRequest(req: NextRequest): Promise<{ integration: string; values: Record<string, string> }> {
  const length = Number(req.headers.get('content-length') ?? '0');
  if (!Number.isFinite(length) || length > MAX_BODY_BYTES) throw new Error('invalid');
  const bytes = await readBoundedStream(req.body, MAX_BODY_BYTES);
  const parsed = parseJsonWithUniqueKeys(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).sort().join('|') !== 'integration|values') throw new Error('invalid');
  const body = parsed as { integration?: unknown; values?: unknown };
  if (typeof body.integration !== 'string' || !Object.hasOwn(ALLOWED_FIELDS, body.integration) || !body.values || typeof body.values !== 'object' || Array.isArray(body.values)) throw new Error('invalid');
  const allowed = ALLOWED_FIELDS[body.integration];
  const entries = Object.entries(body.values as Record<string, unknown>);
  if (entries.some(([key, value]) => !allowed.includes(key) || typeof value !== 'string' || value.length > 8_192 || /[\u0000-\u001f\u007f-\u009f]/.test(value))) throw new Error('invalid');
  return { integration: body.integration, values: Object.fromEntries(entries) as Record<string, string> };
}

async function readBoundedStream(stream: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array> {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new Error('too-large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

function safeCalendarUrl(raw: string): URL | null {
  try {
    if (raw.length > 4096 || /[\u0000-\u0020\u007f-\u009f\\?#]/.test(raw) || /%2e|%2f|%5c/i.test(raw)) return null;
    const pattern = /^https:\/\/calendar\.google\.com\/calendar\/ical\/((?:[A-Za-z0-9._~!$&'()*+,;=:@-]|%40)+)\/([A-Za-z0-9_-]+)\/basic\.ics$/;
    if (!pattern.test(raw) || /\/(?:\.{1,2})\//.test(raw)) return null;
    const url = new URL(raw);
    if (url.href !== raw || url.protocol !== 'https:' || url.hostname !== 'calendar.google.com' || url.port || url.username || url.password) return null;
    return url;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const denied = await requireOwner(req);
  if (denied) return denied;
  let request;
  try { request = await readRequest(req); }
  catch { return NextResponse.json({ ok: false, message: 'Invalid settings test request.' }, { status: 400 }); }
  const { integration, values } = request;

  try {
    const signal = AbortSignal.timeout(10_000);
    switch (integration) {
      case 'anthropic': {
        const key = values.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '';
        if (!key) return NextResponse.json({ ok: false, message: 'No API key provided.' });
        const res = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, redirect: 'error', signal });
        return NextResponse.json(res.ok ? { ok: true, message: 'Claude API connected.' } : { ok: false, message: `Auth failed (${res.status}). Check your API key.` });
      }
      case 'stripe': {
        const key = values.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';
        if (!key) return NextResponse.json({ ok: false, message: 'No Stripe secret key provided.' });
        const res = await fetch('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${key}` }, redirect: 'error', signal });
        return NextResponse.json(res.ok ? { ok: true, message: 'Stripe connected.' } : { ok: false, message: `Auth failed (${res.status}). Check your Stripe secret key.` });
      }
      case 'ghl': {
        const apiKey = values.GHL_API_KEY || process.env.GHL_API_KEY || '';
        const locationId = values.GHL_LOCATION_ID || process.env.GHL_LOCATION_ID || '';
        if (!apiKey || !locationId) return NextResponse.json({ ok: false, message: 'API key and Location ID are required.' });
        const res = await fetch(`https://services.leadconnectorhq.com/contacts/?locationId=${encodeURIComponent(locationId)}&limit=1`, { headers: { Authorization: `Bearer ${apiKey}`, Version: '2021-07-28' }, redirect: 'error', signal });
        return NextResponse.json(res.ok ? { ok: true, message: 'GoHighLevel connected.' } : { ok: false, message: `Auth failed (${res.status}). Check your API key and Location ID.` });
      }
      case 'calendar': {
        const url = safeCalendarUrl(values.GOOGLE_CALENDAR_ICAL_URL || process.env.GOOGLE_CALENDAR_ICAL_URL || '');
        if (!url) return NextResponse.json({ ok: false, message: 'Use a Google Calendar secret iCal HTTPS URL.' }, { status: 400 });
        const res = await fetch(url, { headers: { Accept: 'text/calendar' }, cache: 'no-store', redirect: 'error', signal });
        const declared = Number(res.headers.get('content-length') ?? '0');
        if (!res.ok || (declared && declared > 2_000_000)) return NextResponse.json({ ok: false, message: `Could not safely fetch calendar (${res.status}).` });
        let bytes: Uint8Array;
        try { bytes = await readBoundedStream(res.body, 2_000_000); }
        catch { return NextResponse.json({ ok: false, message: 'Calendar response is too large.' }); }
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        return NextResponse.json(text.includes('BEGIN:VCALENDAR') ? { ok: true, message: 'Google Calendar connected.' } : { ok: false, message: 'URL did not return a valid iCal feed.' });
      }
      default:
        return NextResponse.json({ ok: false, message: 'Unknown integration.' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ ok: false, message: 'Connection test failed safely.' });
  }
}
