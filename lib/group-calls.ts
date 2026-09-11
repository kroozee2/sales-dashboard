// Who actually showed up to a group call.
//
// The board read "0 showed up" on a call that ran 56 minutes. It was not
// counting attendance; it was counting the people Fathom had matched to a
// speaker, filtered out of the calendar invite list:
//
//   invitees.filter((i) => i.matched_speaker_display_name)
//
// Checked against the live API: the most recent call has 178 invitees and
// matched_speaker_display_name is null on every one of them, so that filter
// returns an empty array every time. Even when Fathom does match speakers, a
// group call where Andrew presents and members listen would still score zero,
// because listening is not speaking.
//
// Helm records real attendance — a headcount on the call and named attendees —
// so that is the source. Where nothing is recorded, the board says so rather
// than printing a zero it cannot stand behind.

export type Attendee = { name: string; email?: string | null; source?: string };

export type AttendanceSource = "helm-named" | "helm-count" | "recorded-here" | "none";

export type Attendance = {
  /** How many were on the call, or null when nobody has recorded it. */
  count: number | null;
  names: Attendee[];
  source: AttendanceSource;
  /** What to show a person, said plainly. */
  label: string;
};

const clean = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** A title compared without emoji, case or punctuation, because the two apps disagree on all three. */
export function titleKey(title: string | null | undefined): string {
  return clean(title)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type HelmGroupCall = {
  id: string;
  title: string | null;
  call_date: string | null;
  starts_at: string | null;
  attended: number | null;
  names: Attendee[];
};

const dayOf = (call: { call_date: string | null; starts_at: string | null }): string =>
  (call.call_date ?? call.starts_at ?? "").slice(0, 10);

/**
 * Match a board row to Helm's record of the same call: same day, and a title
 * that matches once the emoji are stripped. Same day alone would collide on a
 * week with two group calls, which is most weeks.
 */
export function matchHelmCall(
  row: { call_date: string; title: string | null },
  helm: HelmGroupCall[],
): HelmGroupCall | null {
  const sameDay = helm.filter((h) => dayOf(h) === row.call_date);
  if (sameDay.length === 0) return null;
  if (sameDay.length === 1) return sameDay[0];

  const key = titleKey(row.title);
  return sameDay.find((h) => titleKey(h.title) === key)
    ?? sameDay.find((h) => key && titleKey(h.title).includes(key))
    ?? null;
}

/**
 * The best attendance we have, and where it came from.
 *
 * Named attendees beat a bare headcount, a headcount beats nothing, and
 * nothing is reported as nothing. A count of zero recorded by a person is a
 * real fact — nobody came — and is kept; a count of zero that only means "we
 * never looked" is not.
 */
export function resolveAttendance(
  row: { attendees: Attendee[] | null; attendee_count: number | null },
  helm: HelmGroupCall | null,
): Attendance {
  const helmNames = (helm?.names ?? []).filter((a) => clean(a.name));
  if (helmNames.length > 0) {
    const count = Math.max(helmNames.length, helm?.attended ?? 0);
    return {
      count,
      names: helmNames,
      source: "helm-named",
      label: count === helmNames.length
        ? `${count} on the call`
        : `${count} on the call, ${helmNames.length} named`,
    };
  }

  if (typeof helm?.attended === "number") {
    return { count: helm.attended, names: [], source: "helm-count", label: `${helm.attended} on the call` };
  }

  const own = (row.attendees ?? []).filter((a) => clean(a.name));
  if (own.length > 0) {
    return { count: own.length, names: own, source: "recorded-here", label: `${own.length} on the call` };
  }
  if (typeof row.attendee_count === "number") {
    return { count: row.attendee_count, names: [], source: "recorded-here", label: `${row.attendee_count} on the call` };
  }

  return { count: null, names: [], source: "none", label: "Not recorded" };
}

/** Whether a board row is still waiting on someone to do something. */
export function outstanding(row: {
  recording_sent: boolean | null;
  fam_sent_at: string | null;
  mastermind_sent_at: string | null;
  fam_draft: string | null;
  mastermind_draft: string | null;
}, attendance: Attendance): string[] {
  const open: string[] = [];
  if (attendance.source === "none") open.push("attendance");
  if (!row.recording_sent) open.push("recording");
  if (row.fam_draft && !row.fam_sent_at) open.push("Fam post");
  if (row.mastermind_draft && !row.mastermind_sent_at) open.push("Mastermind post");
  return open;
}
