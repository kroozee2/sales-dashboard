// Unipile is the hosted messaging API Andrew already uses to send WhatsApp.
// It replaces the local whatsmeow bridge for anything the app sends itself —
// no localhost:8080, no QR re-pairing, so a send works from Vercel.
//
// Two env vars:
//   UNIPILE_DSN      e.g. api1.unipile.com:13111  (host:port, no scheme)
//   UNIPILE_API_KEY  the X-API-KEY value

export type UnipileChat = {
  id: string;
  account_id: string;
  account_type: string;
  provider_id: string | null;
  name: string | null;
  type: number;
};

export class UnipileNotConfigured extends Error {
  constructor() {
    super("Unipile is not configured. Set UNIPILE_DSN and UNIPILE_API_KEY.");
    this.name = "UnipileNotConfigured";
  }
}

function config() {
  const dsn = process.env.UNIPILE_DSN;
  const key = process.env.UNIPILE_API_KEY;
  if (!dsn || !key) throw new UnipileNotConfigured();
  return { base: `https://${dsn.replace(/^https?:\/\//, "")}/api/v1`, key };
}

export function isConfigured() {
  return Boolean(process.env.UNIPILE_DSN && process.env.UNIPILE_API_KEY);
}

async function call(path: string, init?: RequestInit) {
  const { base, key } = config();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "X-API-KEY": key, "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Unipile ${res.status}: ${body.slice(0, 400)}`);
  return body ? JSON.parse(body) : null;
}

// WhatsApp group chats, so a group can be picked by name once rather than
// having its id pasted in by hand.
export async function listWhatsappChats(limit = 250): Promise<UnipileChat[]> {
  const body = (await call(`/chats?account_type=WHATSAPP&limit=${limit}`)) as { items?: UnipileChat[] };
  return body?.items ?? [];
}

// A group's provider_id is its JID (…@g.us). Match on that first because it is
// stable; fall back to the display name, which people rename.
export async function findGroupChat(opts: { jid?: string | null; name?: string | null }) {
  const chats = await listWhatsappChats();
  const groups = chats.filter((c) => (c.provider_id ?? "").endsWith("@g.us"));
  if (opts.jid) {
    const byJid = groups.find((c) => c.provider_id === opts.jid);
    if (byJid) return byJid;
  }
  if (opts.name) {
    const needle = opts.name.toLowerCase();
    const byName = groups.find((c) => (c.name ?? "").toLowerCase().includes(needle));
    if (byName) return byName;
  }
  return null;
}

export async function sendToChat(chatId: string, text: string) {
  return (await call(`/chats/${encodeURIComponent(chatId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  })) as { message_id?: string };
}
