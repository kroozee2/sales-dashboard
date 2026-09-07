import { NextRequest, NextResponse } from 'next/server';
import { createLeadsAdminClient } from '@/lib/supabase-leads';
import { invalidateSettings } from '@/lib/settings';
import { currentMember, identitySigningConfiguredWithSettings } from '@/lib/team-auth';
import { parseJsonWithUniqueKeys } from '@/lib/agent-workforce';
import { MANAGEABLE_SETTINGS_KEYS, MANAGEABLE_SETTINGS_KEY_SET, manageableSettingValueIsValid } from '@/lib/settings-policy';

const MAX_BODY_BYTES = 16_384;

async function requireOwner(req: NextRequest) {
  if (!await identitySigningConfiguredWithSettings()) return NextResponse.json({ error: 'Owner identity service unavailable.' }, { status: 503 });
  const member = await currentMember(req.cookies.get('sos_user')?.value);
  if (!member) return NextResponse.json({ error: 'Sign in with an owner account.' }, { status: 401 });
  if (!member.active || member.role !== 'owner') return NextResponse.json({ error: 'Only an active owner can manage settings.' }, { status: 403 });
  return null;
}

async function readSettingsPatch(req: NextRequest): Promise<Record<string, string>> {
  const declared = req.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) throw new Error('Settings request is too large.');
  if (!req.body) throw new Error('Settings request body is required.');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error('Settings request is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const parsed = parseJsonWithUniqueKeys(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Settings request must be an object.');
  const input = parsed as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length < 1 || keys.length > MANAGEABLE_SETTINGS_KEYS.length) throw new Error('Settings request has an invalid number of fields.');
  const output: Record<string, string> = {};
  for (const key of keys) {
    const value = input[key];
    if (!MANAGEABLE_SETTINGS_KEY_SET.has(key)) throw new Error(`Unsupported settings key: ${key}`);
    if (!manageableSettingValueIsValid(value)) throw new Error(`Invalid value for ${key}`);
    output[key] = value;
  }
  return output;
}

export async function GET(req: NextRequest) {
  const denied = await requireOwner(req);
  if (denied) return denied;
  const supabase = createLeadsAdminClient();
  const { data, error } = await supabase.from('settings').select('key, value').in('key', [...MANAGEABLE_SETTINGS_KEYS]);
  if (error) return NextResponse.json({ error: 'Settings could not be loaded.' }, { status: 500 });
  const map: Record<string, string> = {};
  for (const row of data ?? []) if (MANAGEABLE_SETTINGS_KEY_SET.has(row.key as string) && typeof row.value === 'string') map[row.key as string] = row.value;
  return NextResponse.json({ settings: map });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireOwner(req);
  if (denied) return denied;
  let body: Record<string, string>;
  try { body = await readSettingsPatch(req); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid settings request.' }, { status: 400 }); }
  const supabase = createLeadsAdminClient();
  const updatedAt = new Date().toISOString();
  const upserts = Object.entries(body).map(([key, value]) => ({ key, value, updated_at: updatedAt }));
  const { error } = await supabase.from('settings').upsert(upserts, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: 'Settings could not be saved.' }, { status: 500 });
  invalidateSettings();
  return NextResponse.json({ ok: true });
}
