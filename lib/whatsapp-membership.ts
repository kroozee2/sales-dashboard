import { listWhatsappChats, isConfigured } from "@/lib/unipile";
import { normalizePhone, phoneKey } from "@/lib/masterclass";

// Who is actually in a WhatsApp group.
//
// WhatsApp knows people by phone number, never by email, so membership can only
// be decided for someone whose number we hold. Anyone without one comes back as
// null -- "not checked" -- rather than false, because showing "did not join"
// for a person we simply could not look up is a lie the page would tell every
// time it loaded.

const UNIPILE_TIMEOUT = 20_000;

type Attendee = { provider_id?: string | null; name?: string | null; is_self?: number };

async function unipile(path: string) {
  const dsn = process.env.UNIPILE_DSN!;
  const key = process.env.UNIPILE_API_KEY!;
  const res = await fetch(`https://${dsn.replace(/^https?:\/\//, "")}/api/v1${path}`, {
    headers: { "X-API-KEY": key },
    cache: "no-store",
    signal: AbortSignal.timeout(UNIPILE_TIMEOUT),
  });
  if (!res.ok) throw new Error(`Unipile ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** The set of phone keys in a group, or null if the group could not be read. */
export async function groupPhoneKeys(opts: { jid?: string | null; nameHint?: string | null }): Promise<Set<string> | null> {
  if (!isConfigured()) return null;
  try {
    const chats = await listWhatsappChats();
    const groups = chats.filter((c) => (c.provider_id ?? "").endsWith("@g.us"));
    const chat =
      (opts.jid ? groups.find((c) => c.provider_id === opts.jid) : undefined) ??
      (opts.nameHint
        ? groups.find((c) => (c.name ?? "").toLowerCase().includes(opts.nameHint!.toLowerCase()))
        : undefined);
    if (!chat) return null;

    const body = (await unipile(`/chats/${encodeURIComponent(chat.id)}/attendees`)) as { items?: Attendee[] };
    const keys = new Set<string>();
    for (const a of body.items ?? []) {
      // A WhatsApp attendee id is <number>@s.whatsapp.net.
      const num = (a.provider_id ?? "").split("@")[0];
      const k = phoneKey(normalizePhone(num));
      if (k) keys.add(k);
    }
    return keys;
  } catch (e) {
    console.error("[whatsapp-membership] could not read group:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** true in group, false not in it, null when we could not tell. */
export function isInGroup(phone: string | null, keys: Set<string> | null): boolean | null {
  if (!keys) return null;
  const k = phoneKey(normalizePhone(phone));
  if (!k) return null;
  return keys.has(k);
}
