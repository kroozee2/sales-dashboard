// Reading a recorded call back out of Fathom.
//
// A sales_calls row only carries a Fathom id once somebody linked it by hand,
// so this also matches an unlinked call to a recording by who was on it and
// when — but only when the match is unambiguous.

const FATHOM_BASE = "https://api.fathom.ai/external/v1";

export type FathomMeetingLite = {
  recording_id: number;
  title: string;
  recording_start_time: string | null;
  share_url: string | null;
  invitee_names: string[];
  invitee_emails: string[];
};

export type MatchInput = {
  name: string | null;
  email: string | null;
  call_date: string | null;
};

const STOP_WORDS = new Set(["the", "and", "call", "with", "meeting", "zoom", "sales"]);

function nameTokens(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function hoursApart(left: string, right: string): number | null {
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.abs(a - b) / 3_600_000;
}

/**
 * Finds the one recording that plainly belongs to this call. An email match is
 * proof; a name match needs the clock to agree and must be the only candidate,
 * because attaching the wrong person's transcript is worse than attaching none.
 */
export function matchMeeting(call: MatchInput, meetings: FathomMeetingLite[]): FathomMeetingLite | null {
  const email = call.email?.trim().toLowerCase();
  if (email) {
    const byEmail = meetings.filter((meeting) => meeting.invitee_emails.some((value) => value.toLowerCase() === email));
    if (byEmail.length === 1) return byEmail[0];
    if (byEmail.length > 1 && call.call_date) {
      const sorted = byEmail
        .map((meeting) => ({ meeting, gap: meeting.recording_start_time ? hoursApart(call.call_date!, meeting.recording_start_time) : null }))
        .filter((entry): entry is { meeting: FathomMeetingLite; gap: number } => entry.gap !== null)
        .sort((a, b) => a.gap - b.gap);
      if (sorted.length && sorted[0].gap <= 12) return sorted[0].meeting;
    }
  }

  if (!call.name || !call.call_date) return null;
  const wanted = nameTokens(call.name);
  if (!wanted.length) return null;

  const candidates = meetings.filter((meeting) => {
    if (!meeting.recording_start_time) return false;
    const gap = hoursApart(call.call_date!, meeting.recording_start_time);
    if (gap === null || gap > 12) return false;
    const haystack = nameTokens([meeting.title, ...meeting.invitee_names].join(" "));
    return wanted.every((token) => haystack.includes(token));
  });

  // Ambiguity is a reason to stop, not to guess.
  return candidates.length === 1 ? candidates[0] : null;
}

export function transcriptText(meeting: { transcript?: unknown }, limit = 16_000): string {
  const lines = Array.isArray(meeting.transcript) ? meeting.transcript : [];
  return lines
    .map((line: unknown) => {
      const entry = line as { speaker?: { display_name?: string } | string; text?: string };
      const speaker = typeof entry.speaker === "string" ? entry.speaker : entry.speaker?.display_name ?? "Speaker";
      return `${speaker}: ${entry.text ?? ""}`;
    })
    .join("\n")
    .slice(0, limit);
}

export function summaryText(meeting: { default_summary?: unknown }): string {
  const raw = meeting.default_summary;
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  const record = raw as { markdown_formatted?: unknown };
  return typeof record.markdown_formatted === "string" ? record.markdown_formatted : "";
}

export function toLite(meeting: Record<string, unknown>): FathomMeetingLite {
  const invitees = Array.isArray(meeting.calendar_invitees) ? meeting.calendar_invitees : [];
  return {
    recording_id: Number(meeting.recording_id),
    title: typeof meeting.title === "string" ? meeting.title : "",
    recording_start_time: typeof meeting.recording_start_time === "string" ? meeting.recording_start_time : null,
    share_url: typeof meeting.share_url === "string" ? meeting.share_url : null,
    invitee_names: invitees.map((i: unknown) => String((i as { name?: unknown })?.name ?? "")).filter(Boolean),
    invitee_emails: invitees.map((i: unknown) => String((i as { email?: unknown })?.email ?? "")).filter(Boolean),
  };
}

/** Pulls recent meetings with transcripts. Bounded so one call cannot page forever. */
export async function fetchRecentMeetings(apiKey: string, maxPages = 4): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(`${FATHOM_BASE}/meetings`);
    url.searchParams.set("per_page", "50");
    url.searchParams.set("include_summary", "true");
    url.searchParams.set("include_transcript", "true");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url.toString(), {
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) break;
    const data = await response.json() as { items?: Record<string, unknown>[]; next_cursor?: string | null };
    all.push(...(data.items ?? []));
    cursor = data.next_cursor ?? null;
    if (!cursor) break;
  }
  return all;
}
