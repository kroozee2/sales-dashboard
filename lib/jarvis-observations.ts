export function boundedText(value: unknown, limit = 240): string {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return '';
  const clean = String(value).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, ' ').trim();
  const marker = '… [truncated]';
  return clean.length <= limit ? clean : `${clean.slice(0, Math.max(0, limit - marker.length))}${marker}`;
}

const RAW_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;

function safeHttpsUrl(value: unknown, limit = 500): string {
  if (typeof value !== 'string' || !value || value.length > limit || RAW_CONTROL_PATTERN.test(value) || /\s|\\/.test(value) || value.includes('#')) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.href !== value) return '';
    return url.href;
  } catch { return ''; }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid read-tool record.');
  return value as Record<string, unknown>;
}

function boundedJson(value: unknown): string {
  const json = JSON.stringify(value);
  if (new TextEncoder().encode(json).byteLength > 32_768) throw new Error('Read-tool result exceeds the provider payload limit.');
  return json;
}

function nullableString(item: Record<string, unknown>, key: string, limit: number, required = false): string {
  if (required && !Object.prototype.hasOwnProperty.call(item, key)) throw new Error(`Read-tool field ${key} is required.`);
  const value = item[key];
  if (value === undefined) {
    if (required) throw new Error(`Read-tool field ${key} must be a string or null.`);
    return '';
  }
  if (value === null) return '';
  if (typeof value !== 'string') throw new Error(`Read-tool field ${key} must be a string or null.`);
  if (RAW_CONTROL_PATTERN.test(value)) throw new Error(`Read-tool field ${key} contains invalid control characters.`);
  return boundedText(value, limit);
}

function nullableHttpsUrl(item: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && typeof value !== 'string') throw new Error(`Read-tool field ${key} must be a string or null.`);
  }
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string') {
      const url = safeHttpsUrl(value);
      if (!url) throw new Error(`Read-tool field ${key} must be a canonical HTTPS URL or null.`);
      return url;
    }
  }
  return '';
}

function validatedRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Invalid read-tool result.');
  return value.map(record);
}

export function serializeValidatedReadToolResult(tool: string, value: unknown): string {
  if (tool === 'search_leads' || tool === 'list_recent_leads') {
    const sourceRows = validatedRows(value); const limit = tool === 'search_leads' ? 5 : 8;
    if (sourceRows.length > limit) throw new Error(`Read-tool result exceeds the ${limit}-record limit.`);
    const rows = sourceRows.map((item) => {
      const base = {
        full_name: nullableString(item, 'full_name', 200, true), prospect_stage: nullableString(item, 'prospect_stage', 80, true), quality: nullableString(item, 'quality', 80, true),
        source: nullableString(item, 'source', 120, true), notes: nullableString(item, 'notes', 1000, true),
      };
      if (tool === 'list_recent_leads') return base;
      return { ...base, email: nullableString(item, 'email', 320, true), phone: nullableString(item, 'phone', 80, true) };
    });
    return boundedJson(rows);
  }
  if (tool === 'search_sales_calls' || tool === 'list_recent_sales_calls') {
    const sourceRows = validatedRows(value); const limit = tool === 'search_sales_calls' ? 5 : 8;
    if (sourceRows.length > limit) throw new Error(`Read-tool result exceeds the ${limit}-record limit.`);
    const rows = sourceRows.map((item) => {
      for (const [key, limit] of [['name', 200], ['call_date', 80], ['result', 80], ['offer', 200], ['objections_notes', 1000], ['call_notes', 1000]] as const) nullableString(item, key, limit, true);
      if (!Object.prototype.hasOwnProperty.call(item, 'deal_amount')) throw new Error('Read-tool field deal_amount is required.');
      if (item.deal_amount !== null && (typeof item.deal_amount !== 'number' || !Number.isFinite(item.deal_amount))) throw new Error('Read-tool field deal_amount must be a finite number or null.');
      if (!Object.prototype.hasOwnProperty.call(item, 'objections')) throw new Error('Read-tool field objections is required.');
      if (item.objections !== null && !Array.isArray(item.objections)) throw new Error('Sales-call objections must be a string array.');
      if (Array.isArray(item.objections) && item.objections.some((objection) => typeof objection !== 'string' || RAW_CONTROL_PATTERN.test(objection))) throw new Error('Sales-call objections must contain only control-free strings.');
      if (Array.isArray(item.objections) && item.objections.length > 10) throw new Error('Sales-call objection history exceeds the 10-item safe display limit.');
      if (!Object.prototype.hasOwnProperty.call(item, 'recording_url') || item.recording_url === undefined) throw new Error('Read-tool field recording_url is required.');
      const recordingUrl = nullableHttpsUrl(item, ['recording_url']);
      return {
        name: nullableString(item, 'name', 200, true), call_date: nullableString(item, 'call_date', 80, true), result: nullableString(item, 'result', 80, true), offer: nullableString(item, 'offer', 200, true),
        deal_amount: item.deal_amount == null ? '' : boundedText(item.deal_amount, 80), objections: Array.isArray(item.objections) ? item.objections.map((objection) => boundedText(objection, 120)) : [],
        objections_notes: nullableString(item, 'objections_notes', 1000, true), call_notes: nullableString(item, 'call_notes', 1000, true), ...(recordingUrl ? { recording_url: recordingUrl } : {}),
      };
    });
    return boundedJson(rows);
  }
  if (tool === 'search_ghl') {
    const sourceRows = validatedRows(value);
    if (sourceRows.length > 5) throw new Error('Read-tool result exceeds the 5-record limit.');
    const rows = sourceRows.map((item) => {
      if (!['firstName', 'lastName', 'name'].some((key) => Object.prototype.hasOwnProperty.call(item, key))) throw new Error('GHL contact requires a documented name field.');
      const firstName = nullableString(item, 'firstName', 100); const lastName = nullableString(item, 'lastName', 100); const suppliedName = nullableString(item, 'name', 200);
      const name = `${firstName} ${lastName}`.trim() || suppliedName;
      return { name: name.replace(/\b\w/g, (character) => character.toUpperCase()), email: nullableString(item, 'email', 320), phone: nullableString(item, 'phone', 80) };
    });
    return boundedJson(rows);
  }
  if (tool === 'find_socials') {
    const item = record(value); const output: Record<string, string> = {};
    for (const key of ['facebook_url', 'instagram_url', 'linkedin_url']) {
      if (!Object.prototype.hasOwnProperty.call(item, key)) throw new Error(`Read-tool field ${key} is required.`);
      if (item[key] !== null && typeof item[key] !== 'string') throw new Error(`Read-tool field ${key} must be a string or null.`);
      const url = safeHttpsUrl(item[key]);
      if (typeof item[key] === 'string' && !url) throw new Error(`Read-tool field ${key} must be a canonical HTTPS URL or null.`);
      if (url) output[key] = url;
    }
    return boundedJson(output);
  }
  if (tool === 'list_fathom_recordings') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Fathom result envelope is required.');
    const envelope = value as Record<string, unknown>;
    const keys = Object.keys(envelope).sort();
    if (keys.join(',') !== 'items,more_available,omitted' || !Number.isSafeInteger(envelope.omitted) || Number(envelope.omitted) < 0 || Number(envelope.omitted) > 92 || typeof envelope.more_available !== 'boolean') throw new Error('Invalid Fathom result envelope.');
    const sourceRows = validatedRows(envelope.items);
    if (sourceRows.length > 8) throw new Error('Read-tool result exceeds the 8-record limit.');
    const rows = sourceRows.map((item) => {
      const title = nullableString(item, 'title', 240, true); const date = nullableString(item, 'date', 80, true);
      if (!Object.prototype.hasOwnProperty.call(item, 'share_url') || item.share_url === undefined) throw new Error('Read-tool field share_url is required.');
      const shareUrl = nullableHttpsUrl(item, ['share_url']);
      return { title, date, ...(shareUrl ? { share_url: shareUrl } : {}) };
    });
    return boundedJson({ items: rows, omitted: envelope.omitted, more_available: envelope.more_available });
  }
  throw new Error('Unsupported read-tool result.');
}

export function buildBoundedObservationBody(observations: string[], omittedObservations = 0): string {
  const notice = omittedObservations > 0 ? `${omittedObservations} additional read result${omittedObservations === 1 ? '' : 's'} omitted due to the 10-result display limit.` : '';
  const separator = notice && observations.length ? '\n\n' : '';
  const contentLimit = Math.max(0, 6000 - separator.length - notice.length);
  const content = boundedText(observations.slice(0, 10).join('\n\n'), contentLimit);
  return `${content}${separator}${notice}`;
}

export function summarizeReadResult(tool: string, result: string): string | null {
  try {
    const value = JSON.parse(result) as unknown;
    if ((tool === 'search_leads' || tool === 'list_recent_leads') && Array.isArray(value)) return value.length ? `Leads found:
${value.slice(0, 8).map((row) => { const item = row as Record<string, unknown>; return `• ${boundedText(item.full_name) || 'Unnamed'} | stage: ${boundedText(item.prospect_stage) || 'not set'} | quality: ${boundedText(item.quality) || 'not set'} | source: ${boundedText(item.source) || 'not set'}${item.notes ? ` | notes: ${boundedText(item.notes)}` : ''}`; }).join('\n')}` : 'No matching leads were found.';
    if ((tool === 'search_sales_calls' || tool === 'list_recent_sales_calls') && Array.isArray(value)) return value.length ? `Sales calls found:
${value.slice(0, 8).map((row) => { const item = row as Record<string, unknown>; const objections = Array.isArray(item.objections) ? item.objections.map((entry) => boundedText(entry, 120)).filter(Boolean).join(', ') : boundedText(item.objections); return `• ${boundedText(item.name) || 'Unnamed'} | date: ${boundedText(item.call_date) || 'not set'} | result: ${boundedText(item.result) || 'not set'} | offer: ${boundedText(item.offer) || 'not set'} | deal amount: ${boundedText(item.deal_amount) || 'not set'} | objections: ${objections || 'not recorded'} | objection notes: ${boundedText(item.objections_notes) || 'not recorded'} | recording: ${boundedText(item.recording_url, 500) || 'not available'}${item.call_notes ? ` | call notes: ${boundedText(item.call_notes)}` : ''}`; }).join('\n')}` : 'No matching sales calls were found.';
    if (tool === 'search_ghl' && Array.isArray(value)) return value.length ? `GHL contacts found:
${value.slice(0, 8).map((row) => { const item = row as Record<string, unknown>; return `• ${boundedText(item.name) || 'Unnamed'} | email: ${boundedText(item.email) || 'not set'} | phone: ${boundedText(item.phone) || 'not set'}`; }).join('\n')}` : 'No matching GHL contacts were found.';
    if (tool === 'find_socials' && value && typeof value === 'object' && !Array.isArray(value)) { const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => boundedText(item)).slice(0, 8); return entries.length ? `Social profiles found:
${entries.map(([key, item]) => `• ${boundedText(key, 60)}: ${boundedText(item, 500)}`).join('\n')}` : 'No social profiles were found.'; }
    if (tool === 'list_fathom_recordings' && value && typeof value === 'object' && !Array.isArray(value)) { const envelope = value as { items?: unknown; omitted?: unknown; more_available?: unknown }; if (Array.isArray(envelope.items)) { const rows = envelope.items; const notice = `${Number(envelope.omitted) > 0 ? ` ${String(envelope.omitted)} additional recording${Number(envelope.omitted) === 1 ? '' : 's'} from this page omitted.` : ''}${envelope.more_available ? ' More recordings are available on later Fathom pages.' : ''}`; return rows.length ? `Recent Fathom recordings:
${rows.map((row) => { const item = row as Record<string, unknown>; return `• ${boundedText(item.title ?? item.name) || 'Untitled'} | date: ${boundedText(item.date ?? item.created_at) || 'not set'} | URL: ${boundedText(item.share_url ?? item.url, 500) || 'not available'}`; }).join('\n')}${notice}` : `No recent Fathom recordings were found.${notice}`; } }
  } catch { /* Tool failures remain represented in Completed activity. */ }
  return null;
}
