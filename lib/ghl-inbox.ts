// GoHighLevel conversations inbox — list threads, read a thread, mark read, send.
// Server-only. Uses GHL_API_KEY + GHL_LOCATION_ID.
const GHL = "https://services.leadconnectorhq.com";
const TOKEN = () => process.env.GHL_API_KEY;
const LOC = () => process.env.GHL_LOCATION_ID;

function headers(version = "2021-04-15") {
  return {
    Authorization: `Bearer ${TOKEN()}`,
    Version: version,
    Accept: "application/json",
    "content-type": "application/json",
  };
}

export type GhlThread = {
  id: string;
  contactId: string;
  name: string;
  photo: string | null;
  lastBody: string;
  lastDate: number; // epoch ms
  lastType: string;
  lastDirection: "inbound" | "outbound";
  unread: number;
  phone: string | null;
  email: string | null;
};

type RawConv = {
  id: string; contactId: string; contactName?: string; fullName?: string; profilePhoto?: string;
  lastMessageBody?: string; lastMessageDate?: number; lastMessageType?: string;
  lastMessageDirection?: string; unreadCount?: number; phone?: string; email?: string;
};
function mapConv(c: RawConv): GhlThread {
  return {
    id: c.id,
    contactId: c.contactId,
    name: c.contactName || c.fullName || "Unknown",
    photo: c.profilePhoto || null,
    lastBody: c.lastMessageBody ?? "",
    lastDate: c.lastMessageDate ?? 0,
    lastType: c.lastMessageType ?? "TYPE_SMS",
    lastDirection: (c.lastMessageDirection === "outbound" ? "outbound" : "inbound") as "inbound" | "outbound",
    unread: c.unreadCount ?? 0,
    phone: c.phone ?? null,
    email: c.email ?? null,
  };
}

// One page of the conversations search. Returns rows + GHL's total + the cursor
// (last message date) to fetch the next page.
async function searchPage(opts: { limit: number; query?: string; contactId?: string; direction?: "inbound" | "outbound"; startAfterDate?: number }): Promise<{ rows: GhlThread[]; total: number; nextAfter: number | null }> {
  const params = new URLSearchParams({ locationId: LOC() ?? "", limit: String(opts.limit), sortBy: "last_message_date", sort: "desc" });
  if (opts.query?.trim()) params.set("query", opts.query.trim());
  if (opts.contactId) params.set("contactId", opts.contactId);
  if (opts.direction) params.set("lastMessageDirection", opts.direction);
  if (opts.startAfterDate) params.set("startAfterDate", String(opts.startAfterDate));
  const r = await fetch(`${GHL}/conversations/search?${params}`, { headers: headers(), cache: "no-store" })
    .then((x) => x.json())
    .catch(() => null);
  const raw = (r?.conversations ?? []) as RawConv[];
  const rows = raw.map(mapConv);
  const last = raw.length ? raw[raw.length - 1].lastMessageDate ?? null : null;
  return { rows, total: r?.total ?? rows.length, nextAfter: last };
}

// First page of recent conversations (used for the "All" view).
export async function ghlThreads(limit = 60, opts?: { query?: string; contactId?: string }): Promise<GhlThread[]> {
  const { rows } = await searchPage({ limit, query: opts?.query, contactId: opts?.contactId });
  return rows;
}

// Page through conversations, honoring the direction filter, until we've pulled
// everything (or hit the safety cap). This is how we make sure no inbound is missed.
export async function ghlThreadsAll(opts?: { query?: string; direction?: "inbound" | "outbound"; maxPages?: number }): Promise<{ rows: GhlThread[]; total: number }> {
  const pageSize = 100;
  const maxPages = opts?.maxPages ?? 20; // up to 2000 rows
  const seen = new Set<string>();
  const rows: GhlThread[] = [];
  let after: number | undefined;
  let total = 0;
  for (let p = 0; p < maxPages; p++) {
    let page;
    try {
      page = await searchPage({ limit: pageSize, query: opts?.query, direction: opts?.direction, startAfterDate: after });
    } catch {
      break; // network hiccup — return what we have rather than fail the whole inbox
    }
    total = page.total || total;
    let added = 0;
    for (const row of page.rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
      added++;
    }
    if (page.rows.length < pageSize || page.nextAfter == null || added === 0) break;
    after = page.nextAfter;
    await new Promise((r) => setTimeout(r, 120)); // gentle on GHL rate limits
  }
  return { rows, total };
}

export type GhlMessage = {
  id: string;
  body: string;
  direction: "inbound" | "outbound";
  type: string;
  date: string;
  attachments: string[];
};

// Full history; { locked: true } while GHL's HIPAA toggle blocks the endpoint.
export async function ghlThreadMessages(conversationId: string, limit = 80): Promise<{ locked: boolean; messages: GhlMessage[] }> {
  const r = await fetch(`${GHL}/conversations/${conversationId}/messages?limit=${limit}`, { headers: headers(), cache: "no-store" })
    .then((x) => x.json())
    .catch(() => null);
  if (r?.canonicalCode === "CONVERSATIONS_HIPAA_RESTRICTED") return { locked: true, messages: [] };
  type Raw = { id: string; body?: string; direction?: string; messageType?: string; dateAdded?: string; attachments?: string[] };
  const raw: Raw[] = r?.messages?.messages ?? r?.messages ?? [];
  const messages = (Array.isArray(raw) ? raw : [])
    .filter((m) => m.body || m.attachments?.length)
    .map((m) => ({
      id: m.id,
      body: m.body ?? "",
      direction: (m.direction === "outbound" ? "outbound" : "inbound") as "inbound" | "outbound",
      type: m.messageType ?? "TYPE_SMS",
      date: m.dateAdded ?? new Date(0).toISOString(),
      attachments: m.attachments ?? [],
    }))
    .reverse();
  return { locked: false, messages };
}

export async function ghlMarkRead(conversationId: string): Promise<void> {
  await fetch(`${GHL}/conversations/${conversationId}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ unreadCount: 0 }),
  }).catch(() => null);
}

// Send on a GHL channel. SMS/Email use the typed conversations endpoint; social
// channels post straight to the conversations messages API.
export async function ghlSend(
  contactId: string,
  channel: "SMS" | "Email" | "WhatsApp" | "IG" | "FB" | "Live_Chat",
  message: string,
): Promise<{ ok: boolean; detail?: string }> {
  const body: Record<string, unknown> = { type: channel, contactId, message };
  if (channel === "Email") { body.subject = "Message from Andrew"; body.html = message; }
  const res = await fetch(`${GHL}/conversations/messages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => null);
  return res.ok ? { ok: true } : { ok: false, detail: j?.message || `send failed (${res.status})` };
}

// Find or create a GHL contact so we can message a lead. On duplicate, GHL
// returns the existing contact id in meta — so this is find-or-create.
export async function ghlCreateContact(name: string, email: string | null, phone: string | null): Promise<string | null> {
  const [firstName, ...rest] = (name || "Lead").trim().split(/\s+/);
  const r = await fetch(`${GHL}/contacts/`, {
    method: "POST",
    headers: headers("2021-07-28"),
    body: JSON.stringify({
      locationId: LOC(),
      firstName,
      lastName: rest.join(" ") || undefined,
      email: email || undefined,
      phone: phone || undefined,
    }),
  }).then((x) => x.json()).catch(() => null);
  return r?.contact?.id ?? r?.meta?.contactId ?? null;
}

// Auto-pick a reply channel from the thread's last message type.
export function replyChannel(lastType: string, phone: string | null, email: string | null): "SMS" | "Email" | "WhatsApp" | "IG" | "FB" {
  if (lastType === "TYPE_INSTAGRAM") return "IG";
  if (lastType === "TYPE_FACEBOOK") return "FB";
  if (lastType === "TYPE_WHATSAPP") return "WhatsApp";
  if (lastType.includes("EMAIL") || (!phone && email)) return "Email";
  return "SMS";
}
