import { createLeadsAdminClient } from "@/lib/supabase-leads";
import {
  emptyHotInstagramDocument,
  HOT_INSTAGRAM_SETTINGS_KEY,
  parseHotInstagramDocument,
  type HotInstagramDocument,
} from "@/lib/hot-leads";

type StoredRow = { value: string; updated_at: string };
export class HotLeadsStoreConflictError extends Error {}
export class HotLeadContextNotFoundError extends Error {}

function nextTimestamp(previous?: string) {
  const now = new Date();
  if (previous && now.getTime() <= Date.parse(previous)) return new Date(Date.parse(previous) + 1).toISOString();
  return now.toISOString();
}
async function readRow(): Promise<StoredRow | null> {
  const { data, error } = await createLeadsAdminClient().from("settings").select("value, updated_at").eq("key", HOT_INSTAGRAM_SETTINGS_KEY).maybeSingle();
  if (error) throw new Error("Unable to read Hot Instagram context");
  return data as StoredRow | null;
}
function fromRow(row: StoredRow | null) {
  if (!row) return emptyHotInstagramDocument();
  try { return parseHotInstagramDocument(JSON.parse(row.value)); } catch { throw new Error("Stored Hot Instagram context is invalid"); }
}
export async function readHotInstagram(): Promise<HotInstagramDocument> { return fromRow(await readRow()); }
export async function mutateHotInstagram(mutation: (current: HotInstagramDocument) => HotInstagramDocument): Promise<HotInstagramDocument> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await readRow();
    const next = parseHotInstagramDocument(mutation(fromRow(row)));
    const updatedAt = nextTimestamp(row?.updated_at);
    const db = createLeadsAdminClient();
    if (!row) {
      const { error } = await db.from("settings").insert({ key: HOT_INSTAGRAM_SETTINGS_KEY, value: JSON.stringify(next), updated_at: updatedAt });
      if (!error) return next;
      continue;
    }
    const { data, error } = await db.from("settings").update({ value: JSON.stringify(next), updated_at: updatedAt }).eq("key", HOT_INSTAGRAM_SETTINGS_KEY).eq("updated_at", row.updated_at).select("updated_at").maybeSingle();
    if (error) throw new Error("Unable to update Hot Instagram context");
    if (data) return next;
  }
  throw new HotLeadsStoreConflictError("Hot Instagram context changed concurrently; refresh and try again");
}
