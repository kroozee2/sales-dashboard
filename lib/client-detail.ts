// Everything known about one client, gathered from the record itself.
//
// The Members list was rebuilt on Helm's shape, and the roster now reads and
// writes Helm's `clients` table. What was still missing is the screen you get
// when you click a name: Sales OS had the onboarding runbook and nothing else,
// while Helm's ClientDetail carries eleven sections. Opening a client here sent
// you to Helm to actually see anything, which is the opposite of one place.
//
// This gathers the sections that carry real data. Pure, so the shaping can be
// checked without a database.

/**
 * The sections, in Helm's order. Helm reads as one running page with a sticky
 * pill nav that jumps between sections and lights up as you scroll, rather than
 * tabs that hide everything you are not looking at. Same list, same order, so
 * moving between the two apps does not mean relearning the screen.
 */
export const DETAIL_TABS = [
  { id: "overview", label: "Overview", icon: "📋" },
  { id: "graphics", label: "Graphics", icon: "🎨" },
  { id: "goals", label: "Goals", icon: "🎯" },
  { id: "projects", label: "Projects", icon: "🗂️" },
  { id: "proof", label: "Proof", icon: "⭐️" },
  { id: "onboarding", label: "Onboarding", icon: "🎬" },
  { id: "todos", label: "To-dos", icon: "✅" },
  { id: "calls", label: "Calls", icon: "📞" },
  { id: "checkins", label: "Check-ins", icon: "📈" },
] as const;

export type DetailTab = (typeof DETAIL_TABS)[number]["id"];

/** The welcome kit and headshot, which Helm shows and Sales OS did not carry. */
export type ClientGraphics = {
  headshotUrl: string | null;
  welcomeSquareUrl: string | null;
  welcomeStoryUrl: string | null;
  welcomeMessage: string | null;
  welcomeCaption: string | null;
  skoolUrl: string | null;
  socials: Record<string, string> | null;
};

export type CallRecord = {
  id: string; title: string | null; callDate: string | null; startsAt: string | null;
  isGroup: boolean; status: string | null; attended: number | null;
  fathomUrl: string | null; summary: string | null; nextSteps: string | null;
};
export type TodoRecord = {
  id: string; title: string; description: string | null; dueDate: string | null;
  done: boolean; owner: string | null; status: string | null; urgency: string | null;
};
export type CheckInRecord = {
  id: string; monthLabel: string | null; monthDate: string | null;
  cashCollected: number | null; newRevenue: number | null; nps: number | null;
  callsBooked: number | null; stop: string | null; start: string | null; favorite: string | null;
};
export type CashGoalRecord = { id: string; year: number; month: number; goal: number | null };
export type ProjectRecord = {
  id: string; name: string; note: string | null; done: boolean;
  dueDate: string | null; kind: string | null; isFocus: boolean;
};
export type ProofRecord = {
  id: string; kind: "proof" | "testimonial"; headline: string | null; body: string | null;
  mediaUrl: string | null; source: string | null; date: string | null;
};
export type TicketRecord = {
  id: string; type: string | null; status: string | null; message: string | null;
  submittedAt: string | null; resolvedAt: string | null;
};

export type ClientDetail = {
  graphics: ClientGraphics;
  calls: CallRecord[];
  todos: TodoRecord[];
  checkIns: CheckInRecord[];
  cashGoals: CashGoalRecord[];
  projects: ProjectRecord[];
  proof: ProofRecord[];
  tickets: TicketRecord[];
  notes: { id: string; body: string; category: string | null; pinned: boolean; createdAt: string | null }[];
};

export const EMPTY_GRAPHICS: ClientGraphics = {
  headshotUrl: null, welcomeSquareUrl: null, welcomeStoryUrl: null,
  welcomeMessage: null, welcomeCaption: null, skoolUrl: null, socials: null,
};

export const EMPTY_DETAIL: ClientDetail = {
  graphics: EMPTY_GRAPHICS,
  calls: [], todos: [], checkIns: [], cashGoals: [], projects: [], proof: [], tickets: [], notes: [],
};

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

const text = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

type Row = Record<string, unknown>;

/** Newest first. A record with no date sinks rather than jumping to the top. */
function byDateDesc<T>(rows: T[], pick: (row: T) => string | null): T[] {
  return [...rows].sort((a, b) => {
    const av = pick(a) ?? "";
    const bv = pick(b) ?? "";
    if (!av && !bv) return 0;
    if (!av) return 1;
    if (!bv) return -1;
    return bv.localeCompare(av);
  });
}

export function shapeCalls(rows: Row[]): CallRecord[] {
  return byDateDesc(
    rows.map((r) => ({
      id: String(r.id),
      title: text(r.title),
      callDate: text(r.call_date),
      startsAt: text(r.starts_at),
      isGroup: r.is_group === true,
      status: text(r.status),
      attended: num(r.attended),
      fathomUrl: text(r.fathom_url),
      summary: text(r.ai_summary),
      nextSteps: text(r.ai_next_steps),
    })),
    (c) => c.callDate,
  );
}

export function shapeTodos(rows: Row[]): TodoRecord[] {
  const shaped = rows.map((r) => ({
    id: String(r.id),
    title: text(r.title) ?? "Untitled",
    description: text(r.description),
    dueDate: text(r.due_date),
    done: r.done === true,
    owner: text(r.owner),
    status: text(r.status),
    urgency: text(r.urgency),
  }));
  // Open work first, then by due date. A done list is history; an open list is
  // the thing you are here to act on.
  return [
    ...byDateDesc(shaped.filter((t) => !t.done), (t) => t.dueDate).reverse(),
    ...byDateDesc(shaped.filter((t) => t.done), (t) => t.dueDate),
  ];
}

export function shapeCheckIns(rows: Row[]): CheckInRecord[] {
  return byDateDesc(
    rows.map((r) => ({
      id: String(r.id),
      monthLabel: text(r.month_label),
      monthDate: text(r.month_date),
      cashCollected: num(r.cash_collected),
      newRevenue: num(r.new_revenue),
      nps: num(r.nps),
      callsBooked: num(r.sales_calls_booked),
      stop: text(r.stop),
      start: text(r.start),
      favorite: text(r.favorite),
    })),
    (c) => c.monthDate,
  );
}

export function shapeCashGoals(rows: Row[]): CashGoalRecord[] {
  return rows
    .map((r) => ({ id: String(r.id), year: Number(r.year), month: Number(r.month), goal: num(r.goal) }))
    .filter((g) => Number.isFinite(g.year) && Number.isFinite(g.month))
    .sort((a, b) => b.year - a.year || b.month - a.month);
}

export function shapeProjects(rows: Row[]): ProjectRecord[] {
  const shaped = rows.map((r) => ({
    id: String(r.id),
    name: text(r.name) ?? "Untitled",
    note: text(r.note),
    done: r.done === true,
    dueDate: text(r.due_date),
    kind: text(r.kind),
    isFocus: r.is_focus === true,
  }));
  // What they are focused on, then what is still open, then what is finished.
  const rank = (p: ProjectRecord) => (p.done ? 2 : p.isFocus ? 0 : 1);
  return shaped.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/**
 * Proof and testimonials in one list. They are separate tables in Helm but the
 * same question to a reader: what has this client actually said or shown?
 */
export function shapeProof(proofRows: Row[], testimonialRows: Row[]): ProofRecord[] {
  const proof: ProofRecord[] = proofRows.map((r) => ({
    id: `proof:${String(r.id)}`,
    kind: "proof",
    headline: text(r.headline) ?? text(r.proof_point),
    body: text(r.one_liner) ?? text(r.story) ?? text(r.raw_input),
    mediaUrl: text(r.video_url) ?? (Array.isArray(r.image_urls) ? text(r.image_urls[0]) : null),
    source: text(r.source),
    date: text(r.created_at),
  }));
  const testimonials: ProofRecord[] = testimonialRows.map((r) => ({
    id: `testimonial:${String(r.id)}`,
    kind: "testimonial",
    headline: text(r.format),
    body: text(r.content),
    mediaUrl: text(r.media_url),
    source: text(r.source),
    date: text(r.date) ?? text(r.created_at),
  }));
  // 820 of the 898 testimonial rows carry no text and no media. A card with
  // nothing on it is not proof, so an empty row is dropped rather than shown.
  return byDateDesc(
    [...proof, ...testimonials].filter((item) => item.body || item.mediaUrl),
    (p) => p.date,
  );
}

/** Only real links survive: an empty string is not a graphic. */
export function shapeGraphics(row: Row | null | undefined): ClientGraphics {
  if (!row) return EMPTY_GRAPHICS;
  const socials = row.socials && typeof row.socials === "object" && !Array.isArray(row.socials)
    ? Object.fromEntries(
        Object.entries(row.socials as Record<string, unknown>)
          .map(([k, v]) => [k, text(v) ?? ""])
          .filter(([, v]) => v),
      )
    : null;
  return {
    headshotUrl: text(row.headshot_url),
    welcomeSquareUrl: text(row.welcome_square_url),
    welcomeStoryUrl: text(row.welcome_story_url),
    welcomeMessage: text(row.welcome_message),
    welcomeCaption: text(row.welcome_caption),
    skoolUrl: text(row.skool_url),
    socials: socials && Object.keys(socials).length ? socials : null,
  };
}

export function shapeTickets(rows: Row[]): TicketRecord[] {
  return byDateDesc(
    rows.map((r) => ({
      id: String(r.id),
      type: text(r.type),
      status: text(r.status),
      message: text(r.message),
      submittedAt: text(r.submitted_at),
      resolvedAt: text(r.resolved_at),
    })),
    (t) => t.submittedAt,
  );
}

export function shapeNotes(rows: Row[]) {
  const shaped = rows.map((r) => ({
    id: String(r.id),
    body: text(r.body) ?? "",
    category: text(r.category),
    pinned: r.pinned === true,
    createdAt: text(r.created_at),
  })).filter((n) => n.body);
  // Pinned notes stay at the top; that is what pinning is for.
  return [
    ...byDateDesc(shaped.filter((n) => n.pinned), (n) => n.createdAt),
    ...byDateDesc(shaped.filter((n) => !n.pinned), (n) => n.createdAt),
  ];
}

/** How many rows each tab would show, so an empty tab can say so up front. */
export function tabCounts(detail: ClientDetail): Record<DetailTab, number> {
  const g = detail.graphics;
  return {
    overview: detail.notes.length,
    graphics: [g.headshotUrl, g.welcomeSquareUrl, g.welcomeStoryUrl].filter(Boolean).length,
    calls: detail.calls.length,
    todos: detail.todos.filter((t) => !t.done).length,
    checkins: detail.checkIns.length,
    goals: detail.cashGoals.length,
    projects: detail.projects.filter((p) => !p.done).length,
    proof: detail.proof.length,
    onboarding: 0,
  };
}

/**
 * The most recent month that has actually happened and has money in it.
 *
 * Check-ins are sometimes filed ahead of time, so sorting by date alone put a
 * future month at the top and the header announced "$0" for a month nobody has
 * lived through yet.
 */
export function latestMonth(checkIns: CheckInRecord[], now = new Date()): CheckInRecord | null {
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return checkIns.find((c) =>
    (c.cashCollected !== null || c.newRevenue !== null) &&
    (!c.monthDate || c.monthDate.slice(0, 7) <= thisMonth)) ?? null;
}
