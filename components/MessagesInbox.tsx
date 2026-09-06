"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SubTabs } from "@/components/sub-tabs";

type Row = {
  id: string; // conversationId (or lead:<id> for hot leads with no convo)
  contactId: string | null;
  name: string;
  photo: string | null;
  phone: string | null;
  email: string | null;
  lastBody: string;
  lastDate: number;
  lastType: string;
  lastDirection: "inbound" | "outbound";
  unread: number;
  // Hot-list extras
  leadId?: string;
  socialUrl?: string | null;
  socialType?: string; // ig | fb | li | web
  socialOnly?: boolean; // no phone/email yet — reach via social
};

const SOCIAL_META: Record<string, { emoji: string; label: string }> = {
  ig: { emoji: "📸", label: "Instagram" },
  fb: { emoji: "👥", label: "Facebook" },
  li: { emoji: "💼", label: "LinkedIn" },
  web: { emoji: "🌐", label: "Profile" },
};

type Msg = { id: string; body: string; direction: "inbound" | "outbound"; type: string; date: string; attachments: string[] };
type Channel = "SMS" | "Email" | "WhatsApp" | "IG" | "FB";

const CHANNEL_META: Record<string, { emoji: string; label: string }> = {
  TYPE_SMS: { emoji: "💬", label: "SMS" },
  TYPE_CAMPAIGN_SMS: { emoji: "💬", label: "SMS" },
  TYPE_CUSTOM_SMS: { emoji: "💬", label: "SMS" },
  TYPE_EMAIL: { emoji: "✉️", label: "Email" },
  TYPE_CAMPAIGN_EMAIL: { emoji: "✉️", label: "Email" },
  TYPE_INSTAGRAM: { emoji: "📸", label: "Instagram" },
  TYPE_FACEBOOK: { emoji: "🔵", label: "Messenger" },
  TYPE_WHATSAPP: { emoji: "🟢", label: "WhatsApp" },
  TYPE_LIVE_CHAT: { emoji: "🌐", label: "Live chat" },
  TYPE_CALL: { emoji: "📞", label: "Call" },
};
const meta = (t: string) => CHANNEL_META[t] ?? { emoji: "💬", label: "SMS" };

function autoChannel(r: Row): Channel {
  if (r.lastType === "TYPE_INSTAGRAM") return "IG";
  if (r.lastType === "TYPE_FACEBOOK") return "FB";
  if (r.lastType === "TYPE_WHATSAPP") return "WhatsApp";
  if (r.lastType.includes("EMAIL") || (!r.phone && r.email)) return "Email";
  return "SMS";
}

const CHANNEL_PICK: { key: Channel; emoji: string; label: string }[] = [
  { key: "SMS", emoji: "💬", label: "SMS" },
  { key: "Email", emoji: "✉️", label: "Email" },
  { key: "IG", emoji: "📸", label: "IG" },
  { key: "FB", emoji: "🔵", label: "FB" },
  { key: "WhatsApp", emoji: "🟢", label: "WA" },
];

const PALETTE = ["bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-pink-500", "bg-indigo-500"];
function avatarBg(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff; return PALETTE[h % PALETTE.length]; }
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?"; }

function relTime(ms: number) {
  if (!ms) return "";
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Avatar({ name, photo, size }: { name: string; photo: string | null; size: number }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt={name} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <span className={`rounded-full ${avatarBg(name)} flex items-center justify-center text-white font-semibold flex-shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials(name)}</span>
  );
}

export default function MessagesInbox() {
  const [rows, setRows] = useState<Row[]>([]);
  const [ghlLoc, setGhlLoc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [mode, setMode] = useState<"inbound" | "hot" | "all">("inbound");
  const [counts, setCounts] = useState<{ inbound: number | null; hot: number | null; all: number | null }>({ inbound: null, hot: null, all: null });
  const [chan, setChan] = useState<"all" | "sms" | "email" | "ig" | "fb" | "wa">("all");
  const [active, setActive] = useState<Row | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [locked, setLocked] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState("");
  const [channel, setChannel] = useState<Channel>("SMS");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<Row | null>(null);
  activeRef.current = active;

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const loadRows = useCallback(async () => {
    const m = modeRef.current;
    const r = await fetch(`/api/messages/threads?mode=${m}`).then((x) => x.json()).catch(() => null);
    // Guard against a stale response from a previous tab landing after we switched.
    if (modeRef.current !== m) return;
    if (r?.threads) {
      setRows(r.threads);
      if (typeof r.total === "number") setCounts((c) => ({ ...c, [m]: r.total }));
      setLoadErr(null);
      if (r.ghlLocationId) setGhlLoc(r.ghlLocationId);
      const cur = activeRef.current;
      if (cur) {
        const upd = (r.threads as Row[]).find((t) => t.id === cur.id);
        if (upd && upd.lastDate !== cur.lastDate) setActive(upd);
      }
    } else if (r?.error) setLoadErr(r.error);
    setLoading(false);
  }, []);

  const loadThread = useCallback(async (r: Row) => {
    // Hot lead with no real conversation yet — nothing to fetch.
    if (r.id.startsWith("lead:")) { setMsgs([]); setLocked(false); setThinking(false); return; }
    setThinking(true);
    const params = new URLSearchParams({ conversationId: r.id });
    if (r.contactId) params.set("contactId", r.contactId);
    const j = await fetch(`/api/messages/thread?${params}`).then((x) => x.json()).catch(() => null);
    if (j) { setMsgs(j.messages ?? []); setLocked(!!j.locked); }
    setThinking(false);
  }, []);

  useEffect(() => { const iv = setInterval(loadRows, 45000); return () => clearInterval(iv); }, [loadRows]);
  // (Re)load whenever the mode changes — the server returns inbound-only or all.
  useEffect(() => { setLoading(true); loadRows(); }, [mode, loadRows]);
  useEffect(() => {
    if (!active) return;
    loadThread(active);
    setChannel(autoChannel(active));
    const iv = setInterval(() => activeRef.current && loadThread(activeRef.current), 20000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  const chanGroup = (t: string): "sms" | "email" | "ig" | "fb" | "wa" => {
    if (t.includes("INSTAGRAM")) return "ig";
    if (t.includes("FACEBOOK")) return "fb";
    if (t.includes("WHATSAPP")) return "wa";
    if (t.includes("EMAIL")) return "email";
    return "sms";
  };
  const chanCounts = useMemo(() => {
    const c = { sms: 0, email: 0, ig: 0, fb: 0, wa: 0 } as Record<string, number>;
    for (const r of rows) c[chanGroup(r.lastType)]++;
    return c;
  }, [rows]);
  const list = useMemo(() => {
    const t = filter.trim().toLowerCase();
    return rows.filter((x) => {
      if (mode !== "hot" && chan !== "all" && chanGroup(x.lastType) !== chan) return false;
      if (!t) return true;
      return x.name.toLowerCase().includes(t) || x.lastBody.toLowerCase().includes(t);
    });
  }, [rows, filter, chan, mode]);
  const unreadTotal = useMemo(() => rows.reduce((n, r) => n + r.unread, 0), [rows]);

  const ghlUrl = useMemo(() => {
    if (!ghlLoc || !active) return null;
    if (active.id) return `https://app.gohighlevel.com/v2/location/${ghlLoc}/conversations/conversations/${active.id}`;
    if (active.contactId) return `https://app.gohighlevel.com/v2/location/${ghlLoc}/contacts/detail/${active.contactId}`;
    return null;
  }, [ghlLoc, active]);

  async function send() {
    if (!active || !draft.trim() || sending) return;
    setSending(true); setError(null);
    const body = draft.trim();
    const r = await fetch("/api/messages/send", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId: active.contactId, conversationId: active.id, channel, message: body }),
    }).then((x) => x.json()).catch(() => ({ error: "network error" }));
    setSending(false);
    if (r?.ok) {
      setDraft("");
      setMsgs((m) => [...m, { id: `local-${Date.now()}`, body, direction: "outbound", type: channel, date: new Date().toISOString(), attachments: [] }]);
      setTimeout(loadRows, 1500);
    } else setError(r?.error ?? "Send failed");
  }

  // Mark read → dismiss from the Inbound queue (comes back if they message again).
  const [marking, setMarking] = useState(false);
  async function markRead() {
    if (!active || marking) return;
    setMarking(true);
    const id = active.id;
    const lastDate = active.lastDate;
    // optimistically drop it from the list and move on
    setRows((rs) => rs.filter((r) => r.id !== id));
    setCounts((c) => ({ ...c, inbound: c.inbound != null ? Math.max(0, c.inbound - 1) : c.inbound }));
    setActive(null);
    setMsgs([]);
    await fetch("/api/messages/handle", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: id, lastDate }),
    }).catch(() => {});
    setMarking(false);
  }

  // Remove a hot prospect from the Hot list.
  async function removeHot() {
    if (!active?.leadId || marking) return;
    setMarking(true);
    const lid = active.leadId;
    setRows((rs) => rs.filter((r) => r.leadId !== lid));
    setCounts((c) => ({ ...c, hot: c.hot != null ? Math.max(0, c.hot - 1) : c.hot }));
    setActive(null);
    setMsgs([]);
    await fetch(`/api/leads/${lid}/hot`, { method: "DELETE" }).catch(() => {});
    setMarking(false);
  }

  // GHL's 24-hour Instagram window closed — jump straight to their Instagram DM.
  const igWindowError = !!error && /instagram/i.test(error);
  async function openInstagram() {
    if (!active) return;
    const params = new URLSearchParams({ name: active.name });
    if (active.contactId) params.set("contactId", active.contactId);
    const r = await fetch(`/api/messages/instagram?${params}`).then((x) => x.json()).catch(() => null);
    const url = r?.dmUrl || r?.profileUrl || r?.searchUrl || "https://www.instagram.com/";
    window.open(url, "_blank", "noopener");
  }

  // Taller offset than the other pages: the Leads sub-tab bar sits above this.
  return (
    <div className="w-full flex flex-col" style={{ height: "calc(100dvh - 124px)", minHeight: 460 }}>
      <SubTabs group="leads" />
      <div className="mb-3 flex-shrink-0">
        <h1 className="text-2xl font-bold text-white tracking-tight">💬 Messages</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Every GoHighLevel conversation in one place{unreadTotal ? ` · ${unreadTotal} unread` : ""} — SMS, email, Instagram, Messenger, WhatsApp.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-1 min-h-0">
        {/* thread list */}
        <div className={`${active ? "hidden md:flex" : "flex"} flex-col w-full md:w-[340px] md:min-w-[340px] border-r border-zinc-800`}>
          <div className="p-3 border-b border-zinc-800 space-y-2">
            <div className="flex gap-1 bg-zinc-950 border border-zinc-800 rounded-xl p-1">
              <button onClick={() => setMode("inbound")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${mode === "inbound" ? "bg-blue-600 text-white shadow" : "text-zinc-400 hover:text-white"}`}>
                📥 Inbound{counts.inbound != null ? ` (${counts.inbound.toLocaleString()})` : ""}
              </button>
              <button onClick={() => setMode("hot")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${mode === "hot" ? "bg-orange-600 text-white shadow" : "text-zinc-400 hover:text-white"}`}>
                🔥 Hot{counts.hot != null ? ` (${counts.hot.toLocaleString()})` : ""}
              </button>
              <button onClick={() => setMode("all")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${mode === "all" ? "bg-blue-600 text-white shadow" : "text-zinc-400 hover:text-white"}`}>
                All{counts.all != null ? ` (${counts.all.toLocaleString()})` : ""}
              </button>
            </div>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search conversations…"
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500" />
            {/* Channel filter */}
            {mode !== "hot" && (
            <div className="flex gap-1 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
              {([
                { key: "all", emoji: "", label: "All" },
                { key: "sms", emoji: "💬", label: "Text" },
                { key: "ig", emoji: "📸", label: "IG" },
                { key: "email", emoji: "✉️", label: "Email" },
                { key: "fb", emoji: "🔵", label: "FB" },
                { key: "wa", emoji: "🟢", label: "WA" },
              ] as const).map((c) => {
                const n = c.key === "all" ? rows.length : chanCounts[c.key];
                return (
                  <button key={c.key} onClick={() => setChan(c.key)}
                    className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors border ${chan === c.key ? "bg-blue-600/20 text-blue-300 border-blue-500/40" : "bg-zinc-950 text-zinc-500 border-zinc-800 hover:text-zinc-300"}`}>
                    {c.emoji ? `${c.emoji} ` : ""}{c.label}{n ? ` ${n}` : ""}
                  </button>
                );
              })}
            </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
            {loading ? (
              <div className="p-6 text-center text-sm text-zinc-600">Loading inbox…</div>
            ) : loadErr ? (
              <div className="p-6 text-center text-sm text-rose-400">{loadErr}</div>
            ) : list.length === 0 ? (
              <div className="p-6 text-center text-sm text-zinc-600">{mode === "hot" ? "No hot prospects yet — tap 🔥 on a lead in the Leads grid." : mode === "inbound" && !filter && chan === "all" ? "🎉 All caught up — no inbound waiting on you." : "No conversations here."}</div>
            ) : (
              list.map((r) => {
                const m = meta(r.lastType);
                const isActive = active?.id === r.id;
                const sm = r.socialOnly ? SOCIAL_META[r.socialType ?? "web"] : null;
                return (
                  <button key={r.id} onClick={() => { setActive(r); setMsgs([]); }}
                    className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors ${isActive ? "bg-blue-600/15" : "hover:bg-zinc-800/50"}`}>
                    <Avatar name={r.name} photo={r.photo} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${r.unread ? "font-bold text-white" : "font-semibold text-zinc-200"}`}>{r.name}</span>
                        <span className="text-[10px] text-zinc-600 shrink-0">{relTime(r.lastDate)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {sm ? (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-pink-500/15 text-pink-300 border border-pink-500/30 shrink-0">{sm.emoji} {sm.label} only</span>
                        ) : (
                          <span className="text-[11px] shrink-0" title={m.label}>{m.emoji}</span>
                        )}
                        <span className={`text-xs truncate ${r.unread ? "text-zinc-200 font-medium" : "text-zinc-500"}`}>
                          {sm ? "No phone/email yet" : `${r.lastDirection === "outbound" ? "You: " : ""}${r.lastBody || "(no preview)"}`}
                        </span>
                        {r.unread > 0 && <span className="ml-auto shrink-0 h-5 min-w-5 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold grid place-items-center">{r.unread}</span>}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* thread view */}
        <div className={`${active ? "flex" : "hidden md:flex"} flex-col flex-1 min-w-0`}>
          {!active ? (
            <div className="flex-1 grid place-items-center text-center p-8">
              <div>
                <div className="text-4xl mb-2">💬</div>
                <div className="text-sm font-medium text-zinc-300">Pick a conversation</div>
                <div className="text-xs text-zinc-600 mt-1">Reply on any channel — SMS, email, Instagram, Messenger, WhatsApp — right from here.</div>
              </div>
            </div>
          ) : (
            <>
              {/* header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
                <button className="md:hidden text-zinc-400 hover:text-white text-xl px-1" onClick={() => setActive(null)} aria-label="Back">‹</button>
                <Avatar name={active.name} photo={active.photo} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white truncate">{active.name}</div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    {active.lastDate ? `${meta(active.lastType).emoji} ${meta(active.lastType).label}` : "New conversation"}{active.phone ? ` · ${active.phone}` : active.email ? ` · ${active.email}` : ""}
                  </div>
                </div>
                {active.leadId ? (
                  <button onClick={removeHot} disabled={marking} title="Remove from Hot list"
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-orange-600/20 border border-zinc-700 hover:border-orange-500/40 text-zinc-200 hover:text-orange-300 text-xs font-semibold shrink-0 transition-colors">
                    {marking ? "…" : "🔥 Remove from Hot"}
                  </button>
                ) : (
                  <button onClick={markRead} disabled={marking} title="Mark read and remove from Inbound"
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-emerald-600/20 border border-zinc-700 hover:border-emerald-500/40 text-zinc-200 hover:text-emerald-300 text-xs font-semibold shrink-0 transition-colors">
                    {marking ? "…" : "✓ Mark as Read"}
                  </button>
                )}
                {active.socialUrl && (
                  <a href={active.socialUrl} target="_blank" rel="noreferrer" title="Open their social profile" className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-600 to-fuchsia-600 hover:opacity-90 text-white text-xs font-semibold shrink-0 transition-opacity">
                    {SOCIAL_META[active.socialType ?? "web"].emoji} {SOCIAL_META[active.socialType ?? "web"].label} ↗
                  </a>
                )}
                {ghlUrl && !active.socialOnly && <a href={ghlUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shrink-0 transition-colors">Open in GHL ↗</a>}
              </div>

              {/* messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                {locked && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-800/40 p-3 text-xs text-zinc-400 mb-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span>🔒 GHL hides past history from the app — messages you send from here show below.</span>
                      {ghlUrl && <a href={ghlUrl} target="_blank" rel="noreferrer" className="font-semibold text-blue-400 whitespace-nowrap">Read the full thread in GHL ↗</a>}
                    </div>
                    {active.lastBody && (
                      <div className="mt-2 rounded-lg bg-zinc-900 border border-zinc-800 p-2.5">
                        <span className="font-semibold text-zinc-200">{active.lastDirection === "outbound" ? "You" : active.name.split(" ")[0]} (latest):</span> {active.lastBody}
                      </div>
                    )}
                  </div>
                )}
                {thinking && msgs.length === 0 && !locked && <div className="text-center text-xs text-zinc-600 py-6">Loading messages…</div>}
                {!thinking && msgs.length === 0 && !locked && <div className="text-center text-xs text-zinc-600 py-6">No messages yet — start the conversation below 👇</div>}
                {msgs.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${m.direction === "outbound" ? "bg-blue-600 text-white rounded-br-md" : "bg-zinc-800 text-zinc-100 rounded-bl-md"}`}>
                      {m.body}
                      {m.attachments.map((a, i) => <a key={i} href={a} target="_blank" rel="noreferrer" className="block underline text-xs mt-1 truncate">📎 attachment</a>)}
                      <div className={`text-[10px] mt-1 ${m.direction === "outbound" ? "text-white/70" : "text-zinc-500"}`}>
                        {new Date(m.date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>

              {/* composer */}
              {active.socialOnly ? (
                <div className="border-t border-zinc-800 p-4 text-center">
                  <p className="text-sm text-zinc-300">No phone or email yet — reach {active.name.split(" ")[0]} on {SOCIAL_META[active.socialType ?? "web"].label}.</p>
                  {active.socialUrl && (
                    <a href={active.socialUrl} target="_blank" rel="noreferrer" className="inline-flex mt-3 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-fuchsia-600 hover:opacity-90 text-white text-sm font-semibold transition-opacity">
                      {SOCIAL_META[active.socialType ?? "web"].emoji} Message on {SOCIAL_META[active.socialType ?? "web"].label} →
                    </a>
                  )}
                  <p className="text-[11px] text-zinc-600 mt-2">Add their phone or email on the lead to text/email them from here.</p>
                </div>
              ) : (
              <div className="border-t border-zinc-800 p-3 space-y-2">
                {error && (
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs text-rose-400">⚠️ {error}</span>
                    {igWindowError && (
                      <button onClick={openInstagram}
                        className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-600 to-fuchsia-600 hover:opacity-90 text-white text-xs font-semibold transition-opacity flex-shrink-0">
                        📸 Message them on Instagram →
                      </button>
                    )}
                  </div>
                )}
                <div className="flex gap-1">
                  {CHANNEL_PICK.map((c) => (
                    <button key={c.key} onClick={() => setChannel(c.key)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${channel === c.key ? "bg-blue-600/20 text-blue-300" : "text-zinc-500 hover:bg-zinc-800"}`}>
                      {c.emoji} {c.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-end gap-2">
                  <textarea rows={draft.includes("\n") ? 3 : 1} value={draft} onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder={`Message ${active.name.split(" ")[0]}…`}
                    className="flex-1 resize-none bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <button onClick={send} disabled={!draft.trim() || sending}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold shrink-0 transition-colors">
                    {sending ? "…" : "Send"}
                  </button>
                </div>
              </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
