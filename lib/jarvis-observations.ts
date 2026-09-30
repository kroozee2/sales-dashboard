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

function nullableFormText(item: Record<string, unknown>, key: string, limit: number): string {
  if (!Object.prototype.hasOwnProperty.call(item, key)) throw new Error(`Read-tool field ${key} is required.`);
  const value = item[key];
  if (value === null) return '';
  if (typeof value !== 'string') throw new Error(`Read-tool field ${key} must be a string or null.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value)) throw new Error(`Read-tool field ${key} contains invalid control characters.`);
  return boundedText(value, limit);
}

function nullableTimestamp(item: Record<string, unknown>, key: string): string {
  if (!Object.prototype.hasOwnProperty.call(item, key)) throw new Error(`Read-tool field ${key} is required.`);
  const raw = item[key];
  if (raw === null) return '';
  if (typeof raw !== 'string' || raw.length > 80) throw new Error(`Read-tool field ${key} must be a valid timestamp or null.`);
  const value = raw;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) throw new Error(`Read-tool field ${key} must be a valid timestamp or null.`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText); const month = Number(monthText); const day = Number(dayText);
  const hour = Number(hourText); const minute = Number(minuteText); const second = Number(secondText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
  const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] || hour > 23 || minute > 59 || second > 59 || offsetHour > 14 || (offsetHour === 14 && offsetMinute !== 0) || offsetMinute > 59 || !Number.isFinite(Date.parse(value))) throw new Error(`Read-tool field ${key} must be a valid timestamp or null.`);
  return value;
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

export function parsePaidTrialSearchInput(value: unknown): { query: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid paid-trial search input.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).join(',') !== 'query' || typeof input.query !== 'string') throw new Error('Invalid paid-trial search input.');
  if (RAW_CONTROL_PATTERN.test(input.query)) throw new Error('Invalid paid-trial search input.');
  const query = input.query.trim();
  if (query.length < 2 || query.length > 120) throw new Error('Invalid paid-trial search input.');
  return { query };
}

export function paidTrialMatchesQuery(value: unknown, query: string): boolean {
  const item = record(value);
  const needle = query.toLocaleLowerCase('en-US');
  return ['first_name', 'last_name', 'email', 'phone'].some((key) => {
    const field = item[key];
    if (field === null || field === undefined) return false;
    if (typeof field !== 'string') throw new Error(`Paid-trial search field ${key} must be a string or null.`);
    return field.toLocaleLowerCase('en-US').includes(needle);
  });
}

export function serializeValidatedReadToolResult(tool: string, value: unknown, context: { origin?: string } = {}): string {
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
  if (tool === 'list_recent_paid_trials' || tool === 'search_paid_trials') {
    const envelope = record(value);
    if (Object.keys(envelope).sort().join(',') !== 'items,omitted') throw new Error('Invalid paid-trial result envelope.');
    if (!Number.isSafeInteger(envelope.omitted) || Number(envelope.omitted) < 0) throw new Error('Invalid paid-trial omitted count.');
    const sourceRows = validatedRows(envelope.items);
    const limit = tool === 'search_paid_trials' ? 5 : 8;
    if (sourceRows.length > limit) throw new Error(`Read-tool result exceeds the ${limit}-record limit.`);
    if (typeof context.origin !== 'string') throw new Error('Paid-trial detail origin is required.');
    const origin = new URL(context.origin);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || origin.origin !== context.origin) throw new Error('Paid-trial detail origin is invalid.');
    const rows = sourceRows.map((item) => {
      const id = nullableString(item, 'id', 36, true);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Paid-trial id must be a UUID.');
      const stripeSessionId = nullableString(item, 'stripe_session_id', 255, true);
      if (!stripeSessionId.startsWith('cs_live')) throw new Error('Paid-trial result is not a live Stripe purchaser.');
      if (!Object.prototype.hasOwnProperty.call(item, 'qualifies_for_call') || typeof item.qualifies_for_call !== 'boolean') throw new Error('Paid-trial field qualifies_for_call must be a boolean.');
      const stringArray = (key: string) => {
        if (!Object.prototype.hasOwnProperty.call(item, key)) throw new Error(`Read-tool field ${key} is required.`);
        const raw = item[key];
        if (raw === null) return [];
        if (!Array.isArray(raw) || raw.length > 20 || raw.some((entry) => typeof entry !== 'string' || RAW_CONTROL_PATTERN.test(entry))) throw new Error(`Paid-trial field ${key} must be a bounded string array or null.`);
        return raw.map((entry) => boundedText(entry, 240));
      };
      return {
        id,
        first_name: nullableString(item, 'first_name', 100, true),
        last_name: nullableString(item, 'last_name', 100, true),
        email: nullableString(item, 'email', 320, true),
        phone: nullableString(item, 'phone', 80, true),
        purchased_at: nullableTimestamp(item, 'created_at'),
        onboarding_submitted_at: nullableTimestamp(item, 'onboarding_submitted_at'),
        business_type: nullableFormText(item, 'business_type', 240),
        monthly_revenue: nullableFormText(item, 'monthly_revenue', 120),
        qualifies_for_call: item.qualifies_for_call,
        who_and_result: nullableFormText(item, 'who_and_result', 1000),
        offer_links: nullableFormText(item, 'offer_links', 1000),
        lead_sources: stringArray('lead_sources'),
        ai_tools: stringArray('ai_tools'),
        time_leaks: stringArray('time_leaks'),
        why_now: nullableFormText(item, 'why_now', 1000),
        contribution: nullableFormText(item, 'contribution', 1000),
        detail_url: new URL(`/paid-trials?id=${encodeURIComponent(id)}`, origin).href,
      };
    });
    return boundedJson({ items: rows, omitted: envelope.omitted });
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
    if ((tool === 'list_recent_paid_trials' || tool === 'search_paid_trials') && value && typeof value === 'object' && !Array.isArray(value)) {
      const envelope = value as { items?: unknown; omitted?: unknown };
      if (!Array.isArray(envelope.items) || !Number.isSafeInteger(envelope.omitted) || Number(envelope.omitted) < 0) return null;
      const rows = envelope.items.map((row) => {
        const item = row as Record<string, unknown>;
        const name = `${boundedText(item.first_name)} ${boundedText(item.last_name)}`.trim() || 'Unnamed purchaser';
        const list = (key: string) => Array.isArray(item[key]) ? (item[key] as unknown[]).map((entry) => boundedText(entry, 240)).filter(Boolean).join(', ') : '';
        return `• ${name} | phone: ${boundedText(item.phone) || 'not provided'} | email: ${boundedText(item.email) || 'not provided'} | purchased: ${boundedText(item.purchased_at) || 'not available'} | onboarding submitted: ${boundedText(item.onboarding_submitted_at) || 'not submitted'} | business type: ${boundedText(item.business_type) || 'not provided'} | monthly revenue: ${boundedText(item.monthly_revenue) || 'not provided'} | qualifies for call: ${item.qualifies_for_call === true ? 'yes' : 'no'} | who and result: ${boundedText(item.who_and_result) || 'not provided'} | offer links: ${boundedText(item.offer_links) || 'not provided'} | lead sources: ${list('lead_sources') || 'not provided'} | AI tools: ${list('ai_tools') || 'not provided'} | time leaks: ${list('time_leaks') || 'not provided'} | why now: ${boundedText(item.why_now) || 'not provided'} | contribution: ${boundedText(item.contribution) || 'not provided'} | detail: ${boundedText(item.detail_url, 500)}`;
      });
      const notice = Number(envelope.omitted) > 0 ? `${String(envelope.omitted)} additional paid trial${Number(envelope.omitted) === 1 ? '' : 's'} omitted.` : '';
      return rows.length ? `Paid trial purchasers found:${notice ? ` ${notice}` : ''}
${rows.join('\n')}` : `No matching paid trial purchasers were found.${notice ? ` ${notice}` : ''}`;
    }
    if (tool === 'search_ghl' && Array.isArray(value)) return value.length ? `GHL contacts found:
${value.slice(0, 8).map((row) => { const item = row as Record<string, unknown>; return `• ${boundedText(item.name) || 'Unnamed'} | email: ${boundedText(item.email) || 'not set'} | phone: ${boundedText(item.phone) || 'not set'}`; }).join('\n')}` : 'No matching GHL contacts were found.';
    if (tool === 'find_socials' && value && typeof value === 'object' && !Array.isArray(value)) { const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => boundedText(item)).slice(0, 8); return entries.length ? `Social profiles found:
${entries.map(([key, item]) => `• ${boundedText(key, 60)}: ${boundedText(item, 500)}`).join('\n')}` : 'No social profiles were found.'; }
    if (tool === 'list_fathom_recordings' && value && typeof value === 'object' && !Array.isArray(value)) { const envelope = value as { items?: unknown; omitted?: unknown; more_available?: unknown }; if (Array.isArray(envelope.items)) { const rows = envelope.items; const notice = `${Number(envelope.omitted) > 0 ? ` ${String(envelope.omitted)} additional recording${Number(envelope.omitted) === 1 ? '' : 's'} from this page omitted.` : ''}${envelope.more_available ? ' More recordings are available on later Fathom pages.' : ''}`; return rows.length ? `Recent Fathom recordings:
${rows.map((row) => { const item = row as Record<string, unknown>; return `• ${boundedText(item.title ?? item.name) || 'Untitled'} | date: ${boundedText(item.date ?? item.created_at) || 'not set'} | URL: ${boundedText(item.share_url ?? item.url, 500) || 'not available'}`; }).join('\n')}${notice}` : `No recent Fathom recordings were found.${notice}`; } }
  } catch { /* Tool failures remain represented in Completed activity. */ }
  return null;
}
