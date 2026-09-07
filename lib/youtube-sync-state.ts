import { createLeadsAdminClient } from "@/lib/supabase-leads";

export type YouTubeSyncRun = { runId: string; datasetId: string; contentType: "videos" | "shorts"; publishedAfter: string };

function validRun(run: YouTubeSyncRun): boolean {
  return Boolean(run && typeof run.runId === "string" && typeof run.datasetId === "string" && run.runId.length > 0 && run.datasetId.length > 0 && run.runId.length <= 100 && run.datasetId.length <= 100 &&
    (run.contentType === "videos" || run.contentType === "shorts") && /^\d{4}-\d{2}-\d{2}$/.test(run.publishedAfter));
}

type SyncState = {
  phase: "idle" | "starting" | "running";
  nonce?: string;
  runs?: YouTubeSyncRun[];
  updatedAt: string;
};

const SETTINGS_KEY = "YOUTUBE_POSTED_CONTENT_SYNC";
const STARTING_LOCK_MS = 5 * 60_000;
const RUNNING_LOCK_MS = 24 * 60 * 60_000;
const MAX_ATTEMPTS = 3;

function parseState(value: unknown): SyncState | null {
  if (typeof value !== "string") return null;
  try {
    const state = JSON.parse(value) as SyncState;
    if (!state || !["idle", "starting", "running"].includes(state.phase) || !state.updatedAt) return null;
    if (state.runs && (state.runs.length !== 2 || state.runs.some((run) => !validRun(run)) || new Set(state.runs.map((run) => run.contentType)).size !== 2)) return null;
    return state;
  } catch {
    return null;
  }
}

function isFresh(state: SyncState, maxAgeMs: number, now = Date.now()) {
  const updatedAt = Date.parse(state.updatedAt);
  return Number.isFinite(updatedAt) && now - updatedAt < maxAgeMs;
}

export async function claimYouTubeSyncStart(): Promise<
  | { kind: "claimed"; nonce: string }
  | { kind: "wait" }
  | { kind: "reuse"; runs: YouTubeSyncRun[] }
> {
  const db = createLeadsAdminClient();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { data: row, error: readError } = await db.from("settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
    if (readError) throw new Error(readError.message);
    const currentRaw = typeof row?.value === "string" ? row.value : null;
    const current = parseState(currentRaw);
    if (current?.phase === "running" && current.runs?.length && isFresh(current, RUNNING_LOCK_MS)) return { kind: "reuse", runs: current.runs };
    if (current?.phase === "starting" && isFresh(current, STARTING_LOCK_MS)) return { kind: "wait" };

    const nonce = crypto.randomUUID();
    const nextRaw = JSON.stringify({ phase: "starting", nonce, updatedAt: new Date().toISOString() } satisfies SyncState);
    if (currentRaw === null) {
      const { data: inserted, error } = await db
        .from("settings")
        .insert({ key: SETTINGS_KEY, value: nextRaw, updated_at: new Date().toISOString() })
        .select("value")
        .maybeSingle();
      if (inserted) return { kind: "claimed", nonce };
      if (error?.code !== "23505") throw new Error(error?.message || "Could not claim YouTube sync");
      continue;
    }

    const { data: updated, error } = await db
      .from("settings")
      .update({ value: nextRaw, updated_at: new Date().toISOString() })
      .eq("key", SETTINGS_KEY)
      .eq("value", currentRaw)
      .select("value")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (updated) return { kind: "claimed", nonce };
  }
  return { kind: "wait" };
}

export async function getReservedYouTubeSyncRuns(): Promise<YouTubeSyncRun[]> {
  const db = createLeadsAdminClient();
  const { data: row, error } = await db.from("settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  if (error) throw new Error(error.message);
  const state = parseState(row?.value);
  if (state?.phase !== "running" || !state.runs?.length) throw new Error("No active YouTube sync reservation");
  return state.runs;
}

export async function saveYouTubeSyncRuns(nonce: string, runs: YouTubeSyncRun[]): Promise<void> {
  if (runs.length !== 2 || runs.some((run) => !validRun(run)) || new Set(runs.map((run) => run.contentType)).size !== 2) {
    throw new Error("YouTube sync requires exactly two valid runs");
  }
  const db = createLeadsAdminClient();
  const { data: row, error: readError } = await db.from("settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  if (readError) throw new Error(readError.message);
  const currentRaw = typeof row?.value === "string" ? row.value : null;
  const current = parseState(currentRaw);
  if (!currentRaw || current?.phase !== "starting" || current.nonce !== nonce) throw new Error("YouTube sync claim changed before runs were saved");
  const nextRaw = JSON.stringify({ phase: "running", runs, updatedAt: new Date().toISOString() } satisfies SyncState);
  const { data: updated, error } = await db
    .from("settings")
    .update({ value: nextRaw, updated_at: new Date().toISOString() })
    .eq("key", SETTINGS_KEY)
    .eq("value", currentRaw)
    .select("value")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) throw new Error("YouTube sync claim changed before runs were saved");
}

export async function finishYouTubeSync(runs: YouTubeSyncRun[]): Promise<void> {
  const db = createLeadsAdminClient();
  const { data: row, error: readError } = await db.from("settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  if (readError) throw new Error(readError.message);
  const currentRaw = typeof row?.value === "string" ? row.value : null;
  const current = parseState(currentRaw);
  const sameRuns = current?.runs?.length === runs.length && current.runs.every((run, index) =>
    run.runId === runs[index]?.runId && run.datasetId === runs[index]?.datasetId && run.contentType === runs[index]?.contentType && run.publishedAfter === runs[index]?.publishedAfter
  );
  if (!currentRaw || !sameRuns) throw new Error("YouTube sync reservation does not match");
  const nextRaw = JSON.stringify({ phase: "idle", updatedAt: new Date().toISOString() } satisfies SyncState);
  const { data: updated, error } = await db
    .from("settings")
    .update({ value: nextRaw, updated_at: new Date().toISOString() })
    .eq("key", SETTINGS_KEY)
    .eq("value", currentRaw)
    .select("value")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) throw new Error("YouTube sync reservation changed before completion");
}
