export type SafeFathomMeeting = {
  recording_id: number;
  call_id: string;
  title: string;
  date: string | null;
  duration_min: number | null;
  attendees: string | null;
  attendees_omitted: number;
  blurb: null;
  share_url: string | null;
};

const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid Fathom ${label}.`);
  return value as Record<string, unknown>;
}

function own(item: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(item, key);
}

function nullableString(item: Record<string, unknown>, key: string, max: number, required = true): string | null | undefined {
  if (!own(item, key)) {
    if (required) throw new Error(`Missing Fathom ${key}.`);
    return undefined;
  }
  const value = item[key];
  if (value === null) return null;
  if (typeof value !== "string" || value.length > max || CONTROL_PATTERN.test(value)) throw new Error(`Invalid Fathom ${key}.`);
  return value;
}

function timestamp(value: string | null | undefined, key: string): string | null {
  if (value == null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z$/.exec(value);
  if (!match) throw new Error(`Invalid Fathom ${key}.`);
  const [, year, month, day, hour, minute, second, fraction = ''] = match;
  if (fraction.length > 3 && /[^0]/.test(fraction.slice(3))) throw new Error(`Invalid Fathom ${key}.`);
  const milliseconds = fraction.slice(0, 3).padEnd(3, '0');
  const canonical = `${year}-${month}-${day}T${hour}:${minute}:${second}.${milliseconds}Z`;
  const parsed = new Date(canonical);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== canonical) throw new Error(`Invalid Fathom ${key}.`);
  return canonical;
}

function canonicalFathomUrl(value: string | null | undefined, key: 'share_url' | 'url'): string | null {
  if (value == null) return null;
  if (/\s|\\/.test(value) || /[?#]/.test(value)) throw new Error(`Invalid Fathom ${key}.`);
  try {
    const parsed = new URL(value);
    const match = (key === 'share_url' ? /^\/share\/([A-Za-z0-9_-]+)$/ : /^\/calls\/([1-9]\d*)$/).exec(parsed.pathname);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'fathom.video' || parsed.username || parsed.password || parsed.port || parsed.hash || parsed.search || parsed.href !== value || !match) throw new Error();
    if (key === 'url' && (!Number.isSafeInteger(Number(match[1])) || Number(match[1]) <= 0)) throw new Error();
    return parsed.href;
  } catch {
    throw new Error(`Invalid Fathom ${key}.`);
  }
}



export function parseFathomMeetingList(input: unknown): SafeFathomMeeting[] {
  const data = record(input, "response envelope");
  if (!own(data, "items") || !Array.isArray(data.items) || data.items.length > 100) throw new Error("Invalid Fathom response item count.");
  const recordingIds = new Set<number>();
  return data.items.map((entry) => {
    const meeting = record(entry, "meeting");
    if (!own(meeting, "recording_id") || !Number.isSafeInteger(meeting.recording_id) || Number(meeting.recording_id) <= 0) throw new Error("Invalid Fathom recording_id.");
    const recordingId = meeting.recording_id as number;
    if (recordingIds.has(recordingId)) throw new Error("Duplicate Fathom recording_id.");
    recordingIds.add(recordingId);
    const selectedCallId = String(recordingId);
    const title = nullableString(meeting, "title", 240);
    const startValue = timestamp(nullableString(meeting, "recording_start_time", 80), "recording_start_time");
    const endValue = timestamp(nullableString(meeting, "recording_end_time", 80), "recording_end_time");
    if (!own(meeting, "url")) throw new Error("Missing Fathom url.");
    const primaryShareRaw = nullableString(meeting, "share_url", 500, false);
    const fallbackShareRaw = nullableString(meeting, "url", 500);
    if (fallbackShareRaw === null) throw new Error("Invalid Fathom url.");
    const primaryShare = canonicalFathomUrl(primaryShareRaw, 'share_url');
    const fallbackShare = canonicalFathomUrl(fallbackShareRaw, 'url');
    const shareValue = primaryShare ?? fallbackShare;

    if (!own(meeting, "calendar_invitees") || !Array.isArray(meeting.calendar_invitees) || meeting.calendar_invitees.length > 500) throw new Error("Invalid Fathom invitees.");
    const externals = meeting.calendar_invitees.map((entry) => {
      const invitee = record(entry, "invitee");
      if (!own(invitee, "is_external") || typeof invitee.is_external !== "boolean") throw new Error("Invalid Fathom invitee status.");
      const name = nullableString(invitee, "name", 200) ?? "";
      const email = nullableString(invitee, "email", 320) ?? "";
      return { external: invitee.is_external, name, email };
    }).filter((invitee) => invitee.external);

    const start = startValue ? new Date(startValue) : null;
    const end = endValue ? new Date(endValue) : null;
    if (start && end && end.getTime() < start.getTime()) throw new Error("Invalid Fathom duration.");
    const durationMin = start && end ? Math.round((end.getTime() - start.getTime()) / 60_000) : null;
    if (durationMin !== null && (!Number.isSafeInteger(durationMin) || durationMin < 0 || durationMin > 1_440)) throw new Error("Invalid Fathom duration.");
    const visibleInvitees = externals.slice(0, 4);
    const attendeeParts = visibleInvitees.map(({ name, email }) => name && email ? `${name} (${email})` : name || email || "Unknown");
    const attendees = attendeeParts.join(", ") || null;
    const attendeesOmitted = externals.length - visibleInvitees.length;

    return {
      recording_id: recordingId,
      call_id: selectedCallId,
      title: title?.trim() || "Impromptu Meeting",
      date: startValue,
      duration_min: durationMin,
      attendees,
      attendees_omitted: attendeesOmitted,
      blurb: null,
      share_url: shareValue,
    };
  });
}
