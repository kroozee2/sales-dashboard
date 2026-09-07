import { randomBytes } from "node:crypto";

const PREFIX = "[[salesos-booked-view:";
const VERSION = "v1";
const MAX_NOTES = 10_000;
export const BOOKED_VIEW_MOVED_OFF_STATUS = "🗃️ Moved Off Booked View";
const STATUS_TO_TOKEN = new Map<string | null, string>([
  [null, "n"], ["🔜 Upcoming", "u"], ["🚀 Rebook", "r"], ["💳 Payment Link Sent", "p"],
  ["📣 Sent Message", "m"], ["✅ Closed", "c"], ["❌ Lost", "l"],
]);
const TOKEN_TO_STATUS = new Map([...STATUS_TO_TOKEN].map(([status, token]) => [token, status]));
const MARKER = /\[\[salesos-booked-view:v1:([nurpmcl]):([A-Za-z0-9_-]{32})\]\]$/;

export type BookedViewMarker =
  | { status: "none"; visibleNotes: string | null }
  | { status: "moved"; visibleNotes: string | null; priorStatus: string | null; revision: string; rawMarker: string }
  | { status: "malformed"; visibleNotes: string | null };

export function inspectBookedViewMarker(notes: string | null | undefined): BookedViewMarker {
  const raw = notes ?? "";
  const match = raw.match(MARKER);
  if (!raw.includes(PREFIX)) return { status: "none", visibleNotes: notes ?? null };
  if (!match || raw.slice(0, match.index).includes(PREFIX)) return { status: "malformed", visibleNotes: notes ?? null };
  const priorStatus = TOKEN_TO_STATUS.get(match[1]);
  if (priorStatus === undefined) return { status: "malformed", visibleNotes: notes ?? null };
  let visible = raw.slice(0, match.index);
  if (visible.endsWith("\n\n")) visible = visible.slice(0, -2);
  return {
    status: "moved", visibleNotes: visible || null, priorStatus,
    revision: `${VERSION}:${match[2]}`, rawMarker: match[0],
  };
}

export function moveOffBookedView(notes: string | null | undefined, priorStatus: string | null | undefined) {
  const inspected = inspectBookedViewMarker(notes);
  if (inspected.status !== "none") throw new Error(inspected.status === "moved" ? "already-moved" : "marker-collision");
  const normalizedPrior = priorStatus ?? null;
  const token = STATUS_TO_TOKEN.get(normalizedPrior);
  if (!token) throw new Error("unsupported-prior-status");
  const nonce = randomBytes(24).toString("base64url");
  const marker = `${PREFIX}${VERSION}:${token}:${nonce}]]`;
  const visible = notes ?? "";
  const storedNotes = `${visible}${visible ? "\n\n" : ""}${marker}`;
  if (storedNotes.length > MAX_NOTES) throw new Error("marker-too-large");
  return { storedNotes, revision: `${VERSION}:${nonce}` };
}

export function sanitizeBookedViewCall<T extends { call_notes?: string | null; follow_up_status?: string | null }>(call: T): T & {
  booked_view_moved_off: boolean; booked_view_revision?: string; booked_view_error?: "invalid_internal_marker";
} {
  const inspected = inspectBookedViewMarker(call.call_notes);
  const hasMovedStatus = call.follow_up_status === BOOKED_VIEW_MOVED_OFF_STATUS;
  if (hasMovedStatus && inspected.status !== "moved") {
    return { ...call, follow_up_status: null, booked_view_moved_off: false, booked_view_error: "invalid_internal_marker" };
  }
  if (!hasMovedStatus || inspected.status !== "moved") return { ...call, booked_view_moved_off: false };
  return {
    ...call,
    call_notes: inspected.visibleNotes,
    follow_up_status: inspected.priorStatus,
    booked_view_moved_off: true,
    booked_view_revision: inspected.revision,
  };
}
