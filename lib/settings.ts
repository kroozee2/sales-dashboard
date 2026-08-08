import { createLeadsAdminClient } from './supabase-leads';

export type SettingsMap = Record<string, string>;

let cache: SettingsMap | null = null;
let cacheAt = 0;
const TTL = 60_000; // 1 minute

export async function getSettings(): Promise<SettingsMap> {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  const supabase = createLeadsAdminClient();
  const { data } = await supabase.from('settings').select('key, value');
  const map: SettingsMap = {};
  for (const row of data ?? []) map[row.key as string] = row.value as string;
  cache = map;
  cacheAt = Date.now();
  return map;
}

export function invalidateSettings() {
  cache = null;
}

/** Get a single setting, falling back to an env var */
export async function getSetting(key: string, envFallback?: string): Promise<string> {
  const s = await getSettings();
  return s[key] ?? (envFallback ? (process.env[envFallback] ?? '') : '');
}
