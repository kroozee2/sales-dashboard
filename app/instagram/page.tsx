"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  REEL_IDEA_TYPES,
  buildReelIdeaPayload,
  getReelStage,
  isReelIdeaBoardItem,
  type ReelIdeaType,
  type ReelStage,
} from "@/lib/instagram-reel-ideas";
import { cn } from "@/lib/utils";
import { InstagramPerformanceSpreadsheet } from "@/components/instagram-performance-grid";
import type { InstagramPostedContent } from "@/lib/instagram-performance";

type Tab = "ideas" | "performance" | "calendar" | "competitors";
const INSTAGRAM_SYNC_KEY = "instagram-sync-runs";

function hasPendingInstagramSync(): boolean {
  try {
    return localStorage.getItem(INSTAGRAM_SYNC_KEY) === "pending";
  } catch {
    return false;
  }
}

interface AnalyticsData {
  summary: {
    name: string;
    handle: string;
    bio: string;
    postsCount: number;
    reelsCount: number;
    followers: number;
    followersDelta: number;
    followersDeltaAbs: number;
    impressions: string;
    impressionsDelta: number;
    reach: string;
    reachDelta: number;
    profileVisits: string;
    profileVisitsDelta: number;
    linkClicks: string;
    linkClicksDelta: number;
    lastUpdated: string;
  };
  topPosts: Array<{
    id: string;
    rank: number;
    type: "reel" | "carousel" | "image";
    title: string;
    likes: number;
    saves: number;
    shares: number;
    comments: number;
    reach: number;
    views: number | null;
    er: number;
    date: string;
    hook: string;
    cta: string;
    retention: number[];
    worked: string[];
  }>;
  competitors: Array<{
    id: string;
    handle: string;
    name: string;
    followers: string;
    avgViews: string;
    perWeek: number;
    cadence: string;
    summary: string;
    topics: string[];
    hookStyle: string;
    posts: Array<{
      id: string;
      views: string;
      title: string;
      hook: string;
      retention: string;
      tactic: string;
      cta: string;
      why: string;
      format: string;
    }>;
  }>;
  gaps: Array<{ text: string; tag: string }>;
  recommendations: Array<{
    id: string;
    type: "reel" | "carousel";
    title: string;
    format: string;
    reasoning: string;
    hook: string;
    cta: string;
    targetPillar: string;
  }>;
  postedCount: number;
  dbPosts: InstagramPostedContent[];
}

interface InstagramContentItem {
  id: string;
  title: string;
  category: string;
  status: string;
  scheduled_date: string | null;
  platforms: string[];
  creative_type: string | null;
  meta?: Record<string, unknown> | null;
  updated_at: string;
}

type IdeaSort = "date" | "type" | "stage" | "title";

// Every Reel idea in one running list. Deliberately NOT split into per-type
// cards side by side — a sheet is scanned top to bottom, not across columns.
function ReelIdeaSheet({
  items,
  onStage,
  onDate,
  busyIds,
  errors,
}: {
  items: InstagramContentItem[];
  onStage: (item: InstagramContentItem, stage: ReelStage) => void;
  onDate: (item: InstagramContentItem, date: string) => void;
  busyIds: Set<string>;
  errors: Record<string, string>;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<ReelStage | null>(null);
  const [sort, setSort] = useState<IdeaSort>("date");

  const q = query.trim().toLowerCase();
  const typeMeta = (key: string) => REEL_IDEA_TYPES.find((t) => t.key === key);

  const rows = items
    .filter((i) => !typeFilter || i.category === typeFilter)
    .filter((i) => !stageFilter || getReelStage(i) === stageFilter)
    .filter((i) => !q || i.title.toLowerCase().includes(q))
    .sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "type") return (a.category ?? "").localeCompare(b.category ?? "");
      if (sort === "stage") {
        const order: ReelStage[] = ["idea", "shot", "posted"];
        return order.indexOf(getReelStage(a)) - order.indexOf(getReelStage(b));
      }
      // Soonest shoot first; undated ideas sink to the bottom.
      return (a.scheduled_date || "9999-12-31").localeCompare(b.scheduled_date || "9999-12-31");
    });

  const counts = {
    idea: items.filter((i) => getReelStage(i) === "idea").length,
    shot: items.filter((i) => getReelStage(i) === "shot").length,
    posted: items.filter((i) => getReelStage(i) === "posted").length,
  };

  const COLS = "md:grid md:grid-cols-[40px_minmax(0,1fr)_150px_180px_145px] md:items-center md:gap-3";

  const SortBtn = ({ k, label }: { k: IdeaSort; label: string }) => (
    <button
      type="button"
      onClick={() => setSort(k)}
      className={cn("text-left text-[10px] font-bold uppercase tracking-wide transition-colors", sort === k ? "text-pink-300" : "text-zinc-500 hover:text-zinc-300")}
    >
      {label}{sort === k ? " \u2193" : ""}
    </button>
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70">
      <div className="border-b border-zinc-800 p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-black text-white">Reel ideas</h2>
          <span className="text-xs font-bold text-zinc-400">{counts.idea} idea · {counts.shot} shot · {counts.posted} posted</span>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ideas…"
          aria-label="Search Reel ideas"
          className="mb-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-pink-500 focus:outline-none"
        />
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => { setTypeFilter(null); setStageFilter(null); }}
            className={cn("rounded-full border px-3 py-1 text-[11px] font-bold transition-colors", !typeFilter && !stageFilter ? "border-pink-500 bg-pink-500/20 text-pink-100" : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white")}>
            All {items.length}
          </button>
          {REEL_IDEA_TYPES.map((t) => (
            <button key={t.key} type="button" onClick={() => setTypeFilter(typeFilter === t.key ? null : t.key)}
              className={cn("rounded-full border px-3 py-1 text-[11px] font-bold transition-colors", typeFilter === t.key ? "border-pink-500 bg-pink-500/20 text-pink-100" : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white")}>
              {t.emoji} {t.label} {items.filter((i) => i.category === t.key).length}
            </button>
          ))}
          {(["idea", "shot", "posted"] as ReelStage[]).map((st) => (
            <button key={st} type="button" onClick={() => setStageFilter(stageFilter === st ? null : st)}
              className={cn("rounded-full border px-3 py-1 text-[11px] font-bold capitalize transition-colors", stageFilter === st ? "border-amber-400 bg-amber-400/20 text-amber-100" : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white")}>
              {st} {counts[st]}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("hidden border-b border-zinc-800 bg-zinc-900/60 px-4 py-2", COLS)}>
        <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Done</span>
        <SortBtn k="title" label="Idea" />
        <SortBtn k="type" label="Type" />
        <SortBtn k="stage" label="Stage" />
        <SortBtn k="date" label="Shoot date" />
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-zinc-500">
          {items.length === 0 ? "No ideas yet. Add one above \u2191" : "Nothing matches those filters."}
        </p>
      ) : (
        <div className="divide-y divide-zinc-800/80">
          {rows.map((item) => {
            const stage = getReelStage(item);
            const busy = busyIds.has(item.id);
            const meta = typeMeta(item.category ?? "");
            return (
              <div key={item.id} className={cn("px-4 py-2.5 transition-colors hover:bg-zinc-900/50", COLS)}>
                <div className="flex items-start gap-3 md:contents">
                  <button
                    type="button"
                    aria-label={`Mark ${item.title} as ${stage === "idea" ? "shot" : stage === "shot" ? "posted" : "an idea"}`}
                    onClick={() => onStage(item, stage === "idea" ? "shot" : stage === "shot" ? "posted" : "idea")}
                    disabled={busy}
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-black disabled:opacity-50",
                      stage === "idea" && "border-zinc-600 text-transparent hover:border-pink-500",
                      stage === "shot" && "border-amber-400 bg-amber-400 text-zinc-950",
                      stage === "posted" && "border-emerald-400 bg-emerald-400 text-zinc-950",
                    )}
                  >
                    {stage === "idea" ? "•" : "✓"}
                  </button>
                  <p className={cn("min-w-0 flex-1 break-words [overflow-wrap:anywhere] text-sm font-semibold text-zinc-100", stage === "posted" && "text-zinc-500 line-through")}>{item.title}</p>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 pl-11 md:mt-0 md:contents">
                  <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] font-bold text-zinc-400 md:justify-self-start">
                    {meta ? `${meta.emoji} ${meta.label}` : "—"}
                  </span>

                  <div className="flex rounded-lg bg-zinc-950 p-0.5">
                    {(["idea", "shot", "posted"] as ReelStage[]).map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => onStage(item, choice)}
                        aria-pressed={stage === choice}
                        disabled={busy}
                        className={cn(
                          "rounded-md px-2 py-1 text-[11px] font-bold capitalize text-zinc-500 disabled:opacity-50",
                          stage === choice && choice === "idea" && "bg-zinc-700 text-white",
                          stage === choice && choice === "shot" && "bg-amber-400/20 text-amber-300",
                          stage === choice && choice === "posted" && "bg-emerald-400/20 text-emerald-300",
                        )}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>

                  <input
                    type="date"
                    aria-label={`Shoot date for ${item.title}`}
                    value={item.scheduled_date || ""}
                    onChange={(event) => onDate(item, event.target.value)}
                    disabled={busy}
                    className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-300 disabled:opacity-50 [color-scheme:dark] md:w-full md:text-xs"
                  />
                </div>

                {errors[item.id] && (
                  <p role="alert" className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 md:col-span-5">{errors[item.id]}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function InstagramPage() {
  const [tab, setTab] = useState<Tab>("ideas");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Full Content Calendar state
  const [items, setItems] = useState<InstagramContentItem[]>([]);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickIdeaType, setQuickIdeaType] = useState<ReelIdeaType>("connection");
  const [quickShootDate, setQuickShootDate] = useState("");
  const [addingIdea, setAddingIdea] = useState(false);
  const addingIdeaRef = useRef(false);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(() => new Set());
  const updatingIdsRef = useRef<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const quickTitleRef = useRef<HTMLInputElement>(null);
  const contentLoadSeqRef = useRef(0);

  function notify(tone: "success" | "error", text: string) {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = null;
    setNotice({ tone, text });
    if (tone === "success") {
      noticeTimerRef.current = setTimeout(() => setNotice(null), 3500);
    }
  }

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    void loadAnalytics();
    void loadContent().catch((error) => notify("error", error instanceof Error ? error.message : "Instagram content could not be loaded"));
    if (hasPendingInstagramSync()) void continueInstagramSync();
  }, []);

  async function loadAnalytics() {
    setLoading(true);
    setAnalyticsError(null);
    try {
      const res = await fetch("/api/instagram/analytics");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Instagram analytics request failed");
      setData(json);
    } catch (e) {
      console.error(e);
      setAnalyticsError(e instanceof Error ? e.message : "Instagram analytics request failed");
    } finally {
      setLoading(false);
    }
  }

  async function loadContent() {
    const generation = ++contentLoadSeqRef.current;
    const res = await fetch("/api/content");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Instagram content could not be loaded");
    if (!Array.isArray(json.items)) throw new Error("Instagram content response was invalid");
    if (generation !== contentLoadSeqRef.current) return false;
    setItems(json.items);
    return true;
  }

  async function pollInstagramSync() {
    while (true) {
      const pollResponse = await fetch("/api/content/posted/sync-poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "instagram" }),
      });
      const polled = await pollResponse.json();
      if (!pollResponse.ok) {
        if (polled.terminal) localStorage.removeItem(INSTAGRAM_SYNC_KEY);
        throw new Error(polled.error || "Instagram sync failed");
      }
      if (polled.done) return;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  async function continueInstagramSync() {
    setSyncing(true);
    try {
      await pollInstagramSync();
      localStorage.removeItem(INSTAGRAM_SYNC_KEY);
      await loadAnalytics();
      await loadContent();
      notify("success", "Instagram content and performance metrics are current.");
    } catch (e) {
      console.error(e);
      notify("error", `Sync failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  }

  async function triggerSync() {
    if (hasPendingInstagramSync()) {
      await continueInstagramSync();
      return;
    }

    setSyncing(true);
    try {
      let startResponse: Response;
      let started: { started?: boolean; error?: string; pendingStart?: boolean };
      do {
        startResponse = await fetch("/api/content/posted/sync-start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform: "instagram" }),
        });
        started = await startResponse.json();
        if (startResponse.status === 202 && started.pendingStart) await new Promise((resolve) => setTimeout(resolve, 1000));
      } while (startResponse.status === 202 && started.pendingStart);
      if (!startResponse.ok || !started.started) throw new Error(started.error || "Instagram sync could not start");
      localStorage.setItem(INSTAGRAM_SYNC_KEY, "pending");
      await continueInstagramSync();
    } catch (e) {
      console.error(e);
      notify("error", `Sync failed: ${e instanceof Error ? e.message : "Unknown error"}. Use Sync Instagram to resume.`);
      setSyncing(false);
    }
  }

  async function createDraftItem(title: string, type: "reel" | "carousel", hook?: string, cta?: string, scheduledDate?: string) {
    try {
      const payload = {
        title,
        platforms: type === "reel" ? ["instagram"] : ["instagram", "carousel"],
        creative_type: type === "reel" ? "video" : "picture",
        category: "value",
        status: scheduledDate ? "scheduled" : "idea",
        scheduled_date: scheduledDate || null,
        meta: { hook: hook || "", cta: cta || "" },
      };
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Content could not be created");
      await loadContent();
      notify("success", `Added "${title}"${scheduledDate ? " to the shoot calendar" : ""}.`);
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Content could not be created");
    }
  }

  async function addReelIdea() {
    if (!quickTitle.trim() || addingIdeaRef.current) return;
    addingIdeaRef.current = true;
    setAddingIdea(true);
    try {
      const payload = buildReelIdeaPayload(quickTitle, quickIdeaType, quickShootDate);
      const res = await fetch("/api/instagram/reel-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: payload.title,
          category: payload.category,
          scheduled_date: payload.scheduled_date,
          stage: "idea",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.item) throw new Error(json.error || "Reel idea could not be added");
      setQuickTitle("");
      setQuickShootDate("");
      try {
        await loadContent();
        notify("success", `${json.idempotent ? "Already saved" : "Added"} "${payload.title}" in ${REEL_IDEA_TYPES.find((type) => type.key === quickIdeaType)?.label}.`);
      } catch (error) {
        notify("error", `The idea was saved, but the list could not refresh. ${error instanceof Error ? error.message : "Reload the page."}`);
      }
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Reel idea could not be added");
    } finally {
      addingIdeaRef.current = false;
      setAddingIdea(false);
    }
  }

  async function patchItem(id: string, patch: Record<string, unknown>) {
    if (updatingIdsRef.current.has(id)) return;
    updatingIdsRef.current.add(id);
    setUpdatingIds((current) => new Set(current).add(id));
    try {
      const res = await fetch("/api/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Content could not be updated");
      await loadContent();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Content could not be updated");
    } finally {
      updatingIdsRef.current.delete(id);
      setUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function patchReelIdea(item: InstagramContentItem, patch: { stage?: ReelStage; scheduled_date?: string | null }) {
    const id = item.id;
    if (updatingIdsRef.current.has(id)) return;
    updatingIdsRef.current.add(id);
    contentLoadSeqRef.current += 1;
    setUpdatingIds((current) => new Set(current).add(id));
    setRowErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    try {
      const res = await fetch("/api/instagram/reel-ideas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, expected_updated_at: item.updated_at, ...patch }),
      });
      const json = await res.json();
      if (!res.ok || !json.item) throw new Error(json.error || "Reel idea could not be updated");
      setItems((current) => current.map((entry) => entry.id === id ? json.item : entry));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reel idea could not be updated";
      setRowErrors((current) => ({ ...current, [id]: message }));
      if (message.includes("Reload")) void loadContent().catch(() => undefined);
    } finally {
      updatingIdsRef.current.delete(id);
      setUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  function updateReelStage(item: InstagramContentItem, stage: ReelStage) {
    void patchReelIdea(item, { stage });
  }

  function updateReelShootDate(item: InstagramContentItem, date: string) {
    void patchReelIdea(item, { scheduled_date: date || null });
    if (date) {
      const selected = new Date(`${date}T12:00:00`);
      setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    }
  }

  // Calendar calculations
  const year = month.getFullYear(), mon = month.getMonth();
  const firstDay = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();

  // Filter items specifically for Instagram
  const igItems = useMemo(() => {
    return items.filter((i) => i.platforms?.includes("instagram") || i.platforms?.includes("carousel"));
  }, [items]);

  const reelIdeaItems = useMemo(() => items.filter(isReelIdeaBoardItem), [items]);

  const byDay = useMemo(() => {
    const map: Record<number, InstagramContentItem[]> = {};
    for (const it of igItems) {
      if (!it.scheduled_date) continue;
      const d = new Date(it.scheduled_date + "T12:00");
      if (d.getFullYear() === year && d.getMonth() === mon) {
        (map[d.getDate()] ??= []).push(it);
      }
    }
    return map;
  }, [igItems, year, mon]);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  const today = new Date();
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-6 pb-24">
      {/* Header Profile Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-950/90 via-pink-950/50 to-zinc-950 border border-pink-500/30 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 p-0.5 shadow-xl">
              <div className="w-full h-full bg-zinc-950 rounded-[14px] flex items-center justify-center text-2xl font-black text-pink-400">
                📸
              </div>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-black text-white tracking-tight">Instagram Command</h1>
                <span className="px-3 py-0.5 rounded-full bg-pink-500/20 border border-pink-500/40 text-pink-200 text-[11px] font-bold tracking-wide">
                  @kaptainkroeze
                </span>
              </div>
              <p className="text-xs text-zinc-300 mt-1">
                {data?.summary.bio || "Peaceful, purposeful & wildly profitable 7-figure business"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={triggerSync}
              disabled={syncing}
              className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <span className={cn(syncing && "animate-spin")}>🔄</span>
              {syncing ? "Syncing..." : "Sync Instagram"}
            </button>
            <a
              href="https://www.instagram.com/kaptainkroeze/"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-pink-600/20 transition-all flex items-center gap-2"
            >
              <span>↗</span> Open Profile
            </a>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-2 mt-8 pt-4 border-t border-zinc-800/80">
          {[
            { key: "ideas", label: "💡 Ideas" },
            { key: "calendar", label: "📅 Calendar" },
            { key: "performance", label: "📊 Performance" },
            { key: "competitors", label: "🔍 Competitor Reel Analysis" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as Tab)}
              className={cn(
                "px-4 py-2.5 rounded-xl text-xs font-bold transition-all border",
                tab === t.key
                  ? "bg-pink-500/20 border-pink-500/40 text-pink-200 shadow-md shadow-pink-500/10"
                  : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          aria-live={notice.tone === "error" ? "assertive" : "polite"}
          className={cn(
            "fixed bottom-4 left-4 right-4 z-[80] rounded-2xl border p-4 text-sm font-bold shadow-2xl sm:left-auto sm:max-w-md",
            notice.tone === "error"
              ? "border-rose-500/50 bg-rose-950 text-rose-100"
              : "border-emerald-500/40 bg-emerald-950 text-emerald-100",
          )}
        >
          {notice.text}
        </div>
      )}

      {/* 📊 TAB 1: PERFORMANCE */}
      {tab === "performance" && (
        <div className="space-y-6">
          <InstagramPerformanceSpreadsheet posts={data?.dbPosts ?? []} loading={loading} error={analyticsError} />

          {!loading && !analyticsError && data && (
            <>
              {/* Stat Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: "Followers", val: data.summary.followers.toLocaleString(), badge: `+${data.summary.followersDeltaAbs} (7d)`, color: "text-purple-400" },
                  { label: "Impressions", val: data.summary.impressions, badge: `+${data.summary.impressionsDelta}%`, color: "text-pink-400" },
                  { label: "Reach", val: data.summary.reach, badge: `+${data.summary.reachDelta}%`, color: "text-amber-400" },
                  { label: "Profile Visits", val: data.summary.profileVisits, badge: `+${data.summary.profileVisitsDelta}%`, color: "text-sky-400" },
                  { label: "Link Clicks", val: data.summary.linkClicks, badge: `${data.summary.linkClicksDelta}%`, color: "text-blue-400" },
                  { label: "Total Reels", val: data.summary.reelsCount, badge: `${data.summary.postsCount} total`, color: "text-emerald-400" },
                ].map((s, idx) => (
                  <div key={idx} className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 relative overflow-hidden hover:border-pink-500/30 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{s.label}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">{s.badge}</span>
                    </div>
                    <div className={cn("text-2xl font-black tracking-tight mb-1", s.color)}>{s.val}</div>
                  </div>
                ))}
              </div>

              {/* Weekly AI Action Plan */}
              <div className="rounded-3xl bg-gradient-to-b from-purple-900/20 to-zinc-900/80 border border-purple-500/30 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">✨</span>
                    <h2 className="text-base font-black text-white tracking-tight">Weekly Content Recommendations</h2>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-bold uppercase tracking-wider border border-purple-500/30">
                    High Conversion Plan
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {data.recommendations.map((rec) => (
                    <div key={rec.id} className="bg-zinc-950/80 border border-zinc-800 hover:border-purple-500/40 rounded-2xl p-4 flex flex-col justify-between transition-all space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-pink-500/20 text-pink-300 border border-pink-500/30">
                            {rec.format}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-semibold">{rec.targetPillar}</span>
                        </div>
                        <h3 className="text-sm font-bold text-white line-clamp-2">{rec.title}</h3>
                        <p className="text-[11px] text-zinc-400 mt-2 bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-800/80 italic">
                          &ldquo;{rec.hook}&rdquo;
                        </p>
                        <p className="text-[10px] text-purple-300 mt-2">💡 <strong>Why:</strong> {rec.reasoning}</p>
                      </div>

                      <button
                        onClick={() => createDraftItem(rec.title, rec.type, rec.hook, rec.cta)}
                        className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2"
                      >
                        ⚡ Draft {rec.type === "reel" ? "Reel" : "Carousel"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Performing Posts & Retention Curves */}
              <div className="space-y-4">
                <h2 className="text-base font-bold text-white">Top Performing Content & Retentions</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.topPosts.map((post) => (
                    <div key={post.id} className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-5 space-y-4 hover:border-pink-500/30 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-pink-500/20 text-pink-300 text-xs font-black flex items-center justify-center">
                            #{post.rank}
                          </span>
                          <span className="text-xs font-bold text-white uppercase tracking-wider">
                            {post.type === "reel" ? "🎬 Reel" : "🎠 Carousel"}
                          </span>
                        </div>
                        <span className="text-xs text-zinc-500">{post.date}</span>
                      </div>

                      <h3 className="text-sm font-bold text-white">{post.title}</h3>
                      <p className="text-[11px] text-zinc-400 bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 italic">
                        &ldquo;{post.hook}&rdquo;
                      </p>

                      <div className="grid grid-cols-4 gap-2 pt-1 text-center bg-zinc-950/60 p-3 rounded-2xl border border-zinc-800/60">
                        <div>
                          <div className="text-xs font-bold text-white">{post.views ? (post.views / 1000).toFixed(0) + "k" : "N/A"}</div>
                          <div className="text-[9px] text-zinc-500 uppercase font-semibold">Views</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-pink-400">{(post.likes / 1000).toFixed(1)}k</div>
                          <div className="text-[9px] text-zinc-500 uppercase font-semibold">Likes</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-purple-400">{(post.saves / 1000).toFixed(1)}k</div>
                          <div className="text-[9px] text-zinc-500 uppercase font-semibold">Saves</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-emerald-400">{post.er}%</div>
                          <div className="text-[9px] text-zinc-500 uppercase font-semibold">ER</div>
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">What Worked:</span>
                        <ul className="space-y-1">
                          {post.worked.map((w, idx) => (
                            <li key={idx} className="text-[11px] text-zinc-300 flex items-start gap-1.5">
                              <span className="text-emerald-400">✓</span> {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 📅 TAB 2: INSTAGRAM CONTENT CALENDAR */}
      {/* 💡 TAB 1: REEL IDEAS — a single running sheet */}
      {tab === "ideas" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-pink-500/25 bg-gradient-to-br from-pink-950/35 to-zinc-900 p-4 sm:p-5">
            <div className="mb-4">
              <h2 className="text-base font-black text-white">Add a Reel idea</h2>
              <p className="mt-1 text-xs text-zinc-400">Type it, choose the kind, and add a shoot date only when you are ready.</p>
            </div>
            <div className="flex flex-col gap-3">
              <label htmlFor="reel-idea-title" className="text-sm font-bold text-zinc-200">Reel idea</label>
              <input
                ref={quickTitleRef}
                id="reel-idea-title"
                maxLength={500}
                value={quickTitle}
                onChange={(event) => setQuickTitle(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void addReelIdea(); }}
                placeholder="What's the Reel idea?"
                autoComplete="off"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base text-white placeholder-zinc-400 focus:border-pink-500 focus:outline-none"
              />
              <div className="flex flex-wrap gap-2" role="group" aria-label="Reel type">
                {REEL_IDEA_TYPES.map((type) => (
                  <button
                    key={type.key}
                    type="button"
                    onClick={() => setQuickIdeaType(type.key)}
                    aria-pressed={quickIdeaType === type.key}
                    className={cn(
                      "min-h-11 rounded-full border px-4 py-2 text-sm font-bold transition-colors sm:text-xs",
                      quickIdeaType === type.key
                        ? "border-pink-500 bg-pink-500/20 text-pink-100"
                        : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-white",
                    )}
                  >
                    {type.emoji} {type.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="flex-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                  Shoot date <span className="normal-case font-medium text-zinc-400">(optional)</span>
                  <input
                    type="date"
                    value={quickShootDate}
                    onChange={(event) => setQuickShootDate(event.target.value)}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-base text-zinc-300 [color-scheme:dark] sm:text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void addReelIdea()}
                  disabled={!quickTitle.trim() || addingIdea}
                  className="rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-pink-600/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {addingIdea ? "Adding…" : "＋ Add idea"}
                </button>
              </div>
            </div>
          </div>

          <ReelIdeaSheet
            items={reelIdeaItems}
            onStage={updateReelStage}
            onDate={updateReelShootDate}
            busyIds={updatingIds}
            errors={rowErrors}
          />
        </div>
      )}

      {/* 📅 TAB 2: INSTAGRAM CONTENT CALENDAR */}
      {tab === "calendar" && (
        <div className="space-y-4">
          {/* Month Calendar Grid */}
          <div className="overflow-hidden bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setMonth(new Date(year, mon - 1, 1))}
                  className="w-8 h-8 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center"
                >
                  ‹
                </button>
                <span className="text-base font-bold text-white min-w-[150px] text-center">
                  {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </span>
                <button
                  onClick={() => setMonth(new Date(year, mon + 1, 1))}
                  className="w-8 h-8 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center"
                >
                  ›
                </button>
                <button
                  onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
                  className="ml-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Today
                </button>
              </div>
              <span className="text-xs text-zinc-500">{igItems.length} Instagram items</span>
            </div>

            <div className="-mx-1 overflow-x-auto pb-2">
              <div className="min-w-[700px] px-1">
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {weekdays.map((d) => (
                    <div key={d} className="text-center text-[11px] text-zinc-600 font-semibold uppercase py-1">
                      {d}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {cells.map((day, i) => {
                if (!day) return <div key={`e${i}`} className="min-h-[92px] rounded-xl bg-zinc-950/40" />;
                const dayItems = byDay[day] ?? [];
                const isToday = today.getFullYear() === year && today.getMonth() === mon && today.getDate() === day;
                const dateStr = `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isDropTarget = dragOverDay === dateStr;

                return (
                  <div
                    key={day}
                    onDragOver={(e) => {
                      if (dragId) {
                        e.preventDefault();
                        if (dragOverDay !== dateStr) setDragOverDay(dateStr);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverDay === dateStr) setDragOverDay(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain") || dragId;
                      if (id) {
                        const dragged = items.find((item) => item.id === id);
                        if (dragged && isReelIdeaBoardItem(dragged)) updateReelShootDate(dragged, dateStr);
                        else void patchItem(id, { scheduled_date: dateStr });
                      }
                      setDragId(null);
                      setDragOverDay(null);
                    }}
                    className={cn(
                      "group/day relative min-h-[92px] rounded-xl p-1.5 border transition-colors",
                      isDropTarget
                        ? "border-pink-500 bg-pink-600/20 ring-1 ring-pink-500"
                        : isToday
                        ? "border-purple-500/40 bg-purple-600/[0.07]"
                        : "border-transparent hover:bg-zinc-800/40 hover:border-zinc-700"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-zinc-500">
                        {isToday ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-600 text-white">
                            {day}
                          </span>
                        ) : (
                          day
                        )}
                      </span>
                      <button
                        type="button"
                        aria-label={`Add a Reel idea for ${dateStr}`}
                        onClick={() => {
                          setQuickShootDate(dateStr);
                          quickTitleRef.current?.focus();
                          quickTitleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                        className="flex h-11 w-11 items-center justify-center rounded-lg text-lg font-bold text-zinc-300 hover:bg-zinc-700 hover:text-white"
                      >
                        ＋
                      </button>
                    </div>

                    <div className="space-y-1">
                      {dayItems.slice(0, 3).map((it) => (
                        <div
                          key={it.id}
                          draggable
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.setData("text/plain", it.id);
                            setDragId(it.id);
                          }}
                          onDragEnd={() => {
                            setDragId(null);
                            setDragOverDay(null);
                          }}
                          className={cn(
                            "w-full flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] text-left transition-all hover:brightness-125 cursor-grab active:cursor-grabbing",
                            it.creative_type === "video" ? "bg-pink-600/20 border-pink-500/30 text-pink-200" : "bg-purple-600/20 border-purple-500/30 text-purple-200"
                          )}
                        >
                          <span className="text-xs">{it.creative_type === "video" ? "🎬" : "🎠"}</span>
                          <span className="truncate font-semibold">{it.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🔍 TAB 3: COMPETITOR REEL ANALYSIS */}
      {tab === "competitors" && (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-200 text-xs font-semibold">
            💡 <strong>Instagram Reels Competitor Intelligence:</strong> Top creators to model Reels and Carousels for.
          </div>

          {/* Strategic Opportunities */}
          {data?.gaps && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.gaps.map((g, idx) => (
                <div key={idx} className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-start gap-3">
                  <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[9px] font-bold uppercase">
                    {g.tag}
                  </span>
                  <p className="text-xs text-zinc-300 font-medium">{g.text}</p>
                </div>
              ))}
            </div>
          )}

          {/* Competitors List */}
          <div className="space-y-6">
            {data?.competitors.map((comp) => (
              <div key={comp.id} className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 space-y-4 hover:border-pink-500/30 transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-white">{comp.name}</h3>
                      <span className="text-xs font-bold text-pink-400">@{comp.handle}</span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">{comp.summary}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-bold text-purple-300">
                      👥 {comp.followers} followers
                    </span>
                    <span className="px-3 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-bold text-pink-300">
                      👁 {comp.avgViews} avg views
                    </span>
                  </div>
                </div>

                {/* Top Competitor Posts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {comp.posts.map((cp) => (
                    <div key={cp.id} className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-emerald-400">👁 {cp.views} views</span>
                          <span className="text-[10px] text-zinc-500 uppercase font-bold">{cp.format}</span>
                        </div>
                        <h4 className="text-sm font-bold text-white mt-1">{cp.title}</h4>
                        <p className="text-[11px] text-zinc-400 bg-zinc-900 p-2.5 rounded-xl border border-zinc-800 italic mt-2">
                          &ldquo;{cp.hook}&rdquo;
                        </p>
                        <p className="text-[10px] text-zinc-400 mt-2">💡 <strong>Why it worked:</strong> {cp.why}</p>
                      </div>

                      <button
                        onClick={() => createDraftItem(`Model Reel: ${cp.title}`, "reel", cp.hook, cp.cta)}
                        className="w-full py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:brightness-110 text-white text-xs font-bold transition-all shadow-md shadow-purple-600/20"
                      >
                        ⚡ Model Into Andrew&apos;s Voice
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
