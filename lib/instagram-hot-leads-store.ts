import { createLeadsAdminClient } from "@/lib/supabase-leads";
import {
  emptyInstagramHotLeadsDocument,
  INSTAGRAM_HOT_LEADS_SETTINGS_KEY,
  parseInstagramHotLeadsDocument,
  type InstagramHotLeadsDocument,
} from "@/lib/instagram-hot-leads";

type StoredRow = { value: string; updated_at: string };

export class InstagramHotLeadsConflictError extends Error {}
export class InstagramHotLeadNotFoundError extends Error {}

function nextStorageTimestamp(previous?: string): string {
  const now = new Date();
  if (previous && now.getTime() <= Date.parse(previous)) return new Date(Date.parse(previous) + 1).toISOString();
  return now.toISOString();
}

async function readRow(): Promise<StoredRow | null> {
  const supabase = createLeadsAdminClient();
  const { data, error } = await supabase
    .from("settings")
    .select("value, updated_at")
    .eq("key", INSTAGRAM_HOT_LEADS_SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error("Unable to read Instagram hot leads");
  return data as StoredRow | null;
}

function documentFromRow(row: StoredRow | null): InstagramHotLeadsDocument {
  if (!row) return emptyInstagramHotLeadsDocument();
  try {
    return parseInstagramHotLeadsDocument(JSON.parse(row.value));
  } catch {
    throw new Error("Stored Instagram hot leads are invalid");
  }
}

export async function readInstagramHotLeads(): Promise<InstagramHotLeadsDocument> {
  return documentFromRow(await readRow());
}

export async function mutateInstagramHotLeads(
  mutation: (current: InstagramHotLeadsDocument) => InstagramHotLeadsDocument,
): Promise<InstagramHotLeadsDocument> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await readRow();
    const next = parseInstagramHotLeadsDocument(mutation(documentFromRow(row)));
    const updatedAt = nextStorageTimestamp(row?.updated_at);
    const supabase = createLeadsAdminClient();

    if (!row) {
      const { error } = await supabase.from("settings").insert({
        key: INSTAGRAM_HOT_LEADS_SETTINGS_KEY,
        value: JSON.stringify(next),
        updated_at: updatedAt,
      });
      if (!error) return next;
      continue;
    }

    const { data, error } = await supabase
      .from("settings")
      .update({ value: JSON.stringify(next), updated_at: updatedAt })
      .eq("key", INSTAGRAM_HOT_LEADS_SETTINGS_KEY)
      .eq("updated_at", row.updated_at)
      .select("updated_at")
      .maybeSingle();
    if (error) throw new Error("Unable to update Instagram hot leads");
    if (data) return next;
  }
  throw new InstagramHotLeadsConflictError("Instagram hot leads changed concurrently; refresh and try again");
}
