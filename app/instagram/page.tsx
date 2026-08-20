"use client";

import { useEffect, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  CATEGORIES,
  CONTENT_STATUSES,
  PLATFORMS,
  categoryMeta,
  statusMeta,
  platformEmoji,
  platformChip,
  platformLabel,
} from "@/lib/content-constants";

type Tab = "analytics" | "calendar" | "competitors";

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
  dbPosts: Array<any>;
}

export default function InstagramPage() {
  const [tab, setTab] = useState<Tab>("analytics");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Full Content Calendar state
  const [items, setItems] = useState<any[]>([]);
  const [openItem, setOpenItem] = useState<any | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickType, setQuickType] = useState<"reel" | "carousel">("reel");

  useEffect(() => {
    loadAnalytics();
    loadContent();
  }, []);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const res = await fetch("/api/instagram/analytics");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function loadContent() {
    try {
      const res = await fetch("/api/content");
      if (res.ok) {
        const json = await res.json();
        const allItems = json.items ?? [];
        setItems(allItems);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function triggerSync() {
    setSyncing(true);
    try {
      await fetch("/api/content/posted/sync-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "instagram" }),
      });
      await loadAnalytics();
      await loadContent();
      setMsg("✓ Instagram content synced with Apify!");
      setTimeout(() => setMsg(null), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  }

  async function createDraftItem(title: string, type: "reel" | "carousel", hook?: string, cta?: string) {
    try {
      const payload = {
        title,
        platforms: type === "reel" ? ["instagram"] : ["instagram", "carousel"],
        creative_type: type === "reel" ? "video" : "picture",
        category: "growth",
        status: "planned",
        scheduled_date: new Date().toISOString().slice(0, 10),
        meta: {
          hook: hook || "",
          cta: cta || "",
        },
      };

      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setMsg(`✓ Added "${title}" to Instagram Calendar!`);
        setTimeout(() => setMsg(null), 3500);
        await loadContent();
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function patchItem(id: string, patch: any) {
    try {
      const res = await fetch("/api/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (res.ok) {
        await loadContent();
      }
    } catch (e) {
      console.error(e);
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

  const byDay = useMemo(() => {
    const map: Record<number, any[]> = {};
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
            { key: "analytics", label: "📊 Analytics & Reel Retentions" },
            { key: "calendar", label: "📅 Instagram Content Calendar" },
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

      {msg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold animate-in fade-in slide-in-from-top-2 duration-300">
          {msg}
        </div>
      )}

      {/* 📊 TAB 1: ANALYTICS & REEL RETENTIONS */}
      {tab === "analytics" && (
        <div className="space-y-6">
          {loading || !data ? (
            <div className="p-12 text-center text-zinc-500 text-sm">Loading Instagram metrics...</div>
          ) : (
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
                          "{rec.hook}"
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
                        "{post.hook}"
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
      {tab === "calendar" && (
        <div className="space-y-4">
          {/* Quick Add Bar */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
            <input
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder="Quick Add Instagram Reel / Carousel title..."
              className="w-full sm:flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-pink-500"
            />
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                onClick={() => setQuickType("reel")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                  quickType === "reel" ? "bg-pink-600 border-pink-500 text-white" : "bg-zinc-950 border-zinc-800 text-zinc-400"
                )}
              >
                🎬 Reel
              </button>
              <button
                onClick={() => setQuickType("carousel")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                  quickType === "carousel" ? "bg-purple-600 border-purple-500 text-white" : "bg-zinc-950 border-zinc-800 text-zinc-400"
                )}
              >
                🎠 Carousel
              </button>
              <button
                onClick={() => {
                  if (quickTitle.trim()) {
                    createDraftItem(quickTitle.trim(), quickType);
                    setQuickTitle("");
                  }
                }}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 text-white text-xs font-bold shadow-lg shadow-pink-600/20"
              >
                ＋ Add
              </button>
            </div>
          </div>

          {/* Month Calendar Grid */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
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
                    onClick={() => createDraftItem(`New Instagram Content`, "reel")}
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
                      if (id) patchItem(id, { scheduled_date: dateStr });
                      setDragId(null);
                      setDragOverDay(null);
                    }}
                    className={cn(
                      "group/day relative min-h-[92px] rounded-xl p-1.5 border transition-colors cursor-pointer",
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
                      <span className="text-zinc-600 text-sm leading-none opacity-0 group-hover/day:opacity-100 transition-opacity">
                        ＋
                      </span>
                    </div>

                    <div className="space-y-1">
                      {dayItems.slice(0, 3).map((it) => (
                        <div
                          key={it.id}
                          draggable
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
                          "{cp.hook}"
                        </p>
                        <p className="text-[10px] text-zinc-400 mt-2">💡 <strong>Why it worked:</strong> {cp.why}</p>
                      </div>

                      <button
                        onClick={() => createDraftItem(`Model Reel: ${cp.title}`, "reel", cp.hook, cp.cta)}
                        className="w-full py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:brightness-110 text-white text-xs font-bold transition-all shadow-md shadow-purple-600/20"
                      >
                        ⚡ Model Into Andrew's Voice
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
