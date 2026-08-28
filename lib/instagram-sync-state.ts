import { createLeadsAdminClient } from "@/lib/supabase-leads";

export type InstagramSyncRun = { runId: string; datasetId: string };

type SyncState = {
  phase: "idle" | "starting" | "running";
  nonce?: string;
  runs?: InstagramSyncRun[];
  updatedAt: string;
};

const SETTINGS_KEY = "INSTAGRAM_POSTED_CONTENT_SYNC";
const START_LOCK_MS = 2 * 60_000;
const MAX_ATTEMPTS = 3;

function parseState(value: unknown): SyncState | null {
  if (typeof value !== "string") return null;
  try {
    const state = JSON.parse(value) as SyncState;
    if (!state || !["idle", "starting", "running"].includes(state.phase) || !state.updatedAt) return null;
    return state;
  } catch {
    return null;
  }
}

function isFresh(state: SyncState, now = Date.now()) {
  const updatedAt = Date.parse(state.updatedAt);
  return Number.isFinite(updatedAt) && now - updatedAt < START_LOCK_MS;
}

export async function claimInstagramSyncStart(): Promise<
  | { kind: "claimed"; nonce: string }
  | { kind: "wait" }
  | { kind: "reuse"; runs: InstagramSyncRun[] }
> {
  const db = createLeadsAdminClient();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { data: row, error: readError } = await db.from("settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
    if (readError) throw new Error(readError.message);
    const currentRaw = typeof row?.value === "string" ? row.value : null;
    const current = parseState(currentRaw);
    if (current?.phase === "running" && current.runs?.length && isFresh(current)) return { kind: "reuse", runs: current.runs };
    if (current?.phase === "starting" && isFresh(current)) return { kind: "wait" };

    const nonce = crypto.randomUUID();
    const nextRaw = JSON.stringify({ phase: "starting", nonce, updatedAt: new Date().toISOString() } satisfies SyncState);
    if (currentRaw === null) {
      const { data: inserted, error } = await db
        .from("settings")
        .insert({ key: SETTINGS_KEY, value: nextRaw, updated_at: new Date().toISOString() })
        .select("value")
        .maybeSingle();
      if (inserted) return { kind: "claimed", nonce };
      if (error?.code !== "23505") throw new Error(error?.message || "Could not claim Instagram sync");
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

export async function saveInstagramSyncRuns(nonce: string, runs: InstagramSyncRun[]): Promise<void> {
  const db = createLeadsAdminClient();
  const { data: row, error: readError } = await db.from("settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  if (readError) throw new Error(readError.message);
  const currentRaw = typeof row?.value === "string" ? row.value : null;
  const current = parseState(currentRaw);
  if (!currentRaw || current?.phase !== "starting" || current.nonce !== nonce) throw new Error("Instagram sync claim changed before runs were saved");
  const nextRaw = JSON.stringify({ phase: "running", runs, updatedAt: new Date().toISOString() } satisfies SyncState);
  const { data: updated, error } = await db
    .from("settings")
    .update({ value: nextRaw, updated_at: new Date().toISOString() })
    .eq("key", SETTINGS_KEY)
    .eq("value", currentRaw)
    .select("value")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) throw new Error("Instagram sync claim changed before runs were saved");
}

export async function finishInstagramSync(runs: InstagramSyncRun[]): Promise<void> {
  const db = createLeadsAdminClient();
  const { data: row, error: readError } = await db.from("settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  if (readError) throw new Error(readError.message);
  const currentRaw = typeof row?.value === "string" ? row.value : null;
  const current = parseState(currentRaw);
  const sameRuns = current?.runs?.length === runs.length && current.runs.every((run, index) => run.runId === runs[index]?.runId);
  if (!currentRaw || !sameRuns) return;
  const nextRaw = JSON.stringify({ phase: "idle", updatedAt: new Date().toISOString() } satisfies SyncState);
  const { error } = await db
    .from("settings")
    .update({ value: nextRaw, updated_at: new Date().toISOString() })
    .eq("key", SETTINGS_KEY)
    .eq("value", currentRaw);
  if (error) throw new Error(error.message);
}
