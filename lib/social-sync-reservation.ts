export type SyncPlatform = "facebook" | "instagram" | "youtube";
const SYNC_PLATFORMS: SyncPlatform[] = ["facebook", "instagram", "youtube"];

export const SYNC_KEY_PREFIX = "SOCIAL_SYNC_LAST_";
export type SyncRunRef = { runId: string; datasetId: string };
export type SyncReservation = {
  status: "starting" | "running" | "completed";
  token: string;
  platform: SyncPlatform;
  startedAt: string;
  runs?: SyncRunRef[];
  completedAt?: string;
  synced?: number;
};

export const syncKey = (platform: SyncPlatform) => `${SYNC_KEY_PREFIX}${platform.toUpperCase()}`;

export function parseSyncReservation(value: unknown): SyncReservation | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as Partial<SyncReservation>;
    if (!parsed || !SYNC_PLATFORMS.includes(parsed.platform as SyncPlatform) || !["starting", "running", "completed"].includes(parsed.status || "") || typeof parsed.token !== "string" || typeof parsed.startedAt !== "string") return null;
    if (parsed.runs && (!Array.isArray(parsed.runs) || parsed.runs.length > 5 || parsed.runs.some((run) => !run || typeof run.runId !== "string" || typeof run.datasetId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(run.runId) || !/^[A-Za-z0-9_-]{1,100}$/.test(run.datasetId)))) return null;
    return parsed as SyncReservation;
  } catch { return null; }
}

export function reservationTimestamp(value: unknown): string | null {
  const state = parseSyncReservation(value);
  if (state) return state.completedAt || state.startedAt;
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}
