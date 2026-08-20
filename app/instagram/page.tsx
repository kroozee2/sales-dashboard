"use client";

import { useEffect, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import CompetitorResearch from "@/components/competitor-research";

type Tab = "analytics" | "calendar" | "competitors";

interface AnalyticsData {
  summary: {
    handle: string;
    profileUrl: string;
    totalFollowers: number;
    newFollowers: number;
    reach: number;
    mediaEngagement: number;
    profileViews: number;
    linkClicks: number;
    lastUpdated: string;
  };
  dailyGrowth: Array<{ date: string; newFollowers: number; cumulative: number }>;
  dailyTraffic: Array<{ date: string; views: number; clicks: number }>;
  dailyReach: Array<{ date: string; reach: number; engagement: number }>;
  demographics: {
    topGenderAge: { label: string; share: number };
    topCountries: Array<{ code: string; country: string; share: number }>;
  };
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
  recentPosts: Array<any>;
}

export default function InstagramPage() {
  const [tab, setTab] = useState<Tab>("analytics");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [draftCreatedMsg, setDraftCreatedMsg] = useState<string | null>(null);

  // Content calendar state inside Instagram tab
  const [formatFilter, setFormatFilter] = useState<"all" | "reel" | "carousel" | "story">("all");
  const [contentView, setContentView] = useState<"planned" | "posted">("planned");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickType, setQuickType] = useState<"reel" | "carousel">("reel");
  const [items, setItems] = useState<any[]>([]);

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
        const igItems = (json.items ?? []).filter((i: any) =>
          i.platforms?.includes("instagram") || i.platforms?.includes("carousel")
        );
        setItems(igItems);
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
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  }

  async function convertRecommendationToDraft(rec: AnalyticsData["recommendations"][0]) {
    try {
      const payload = {
        title: rec.title,
        platforms: rec.type === "reel" ? ["instagram"] : ["instagram", "carousel"],
        creative_type: rec.type === "reel" ? "video" : "picture",
        category: "growth",
        status: "idea",
        meta: {
          hook: rec.hook,
          cta: rec.cta,
          reasoning: rec.reasoning,
          pillar: rec.targetPillar,
        },
      };

      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setDraftCreatedMsg(`✓ Created draft: "${rec.title}" on Instagram Calendar!`);
        setTimeout(() => setDraftCreatedMsg(null), 3500);
        await loadContent();
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function addQuickInstagramContent() {
    if (!quickTitle.trim()) return;
    try {
      const payload = {
        title: quickTitle.trim(),
        platforms: quickType === "reel" ? ["instagram"] : ["instagram", "carousel"],
        creative_type: quickType === "reel" ? "video" : "picture",
        category: "value",
        status: "planned",
      };

      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setQuickTitle("");
        await loadContent();
      }
    } catch (e) {
      console.error(e);
    }
  }

  const fmtNumber = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toString();
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-950/80 via-pink-950/40 to-zinc-950 border border-pink-500/20 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 p-0.5 shadow-lg">
              <div className="w-full h-full bg-zinc-950 rounded-[14px] flex items-center justify-center text-2xl font-black text-pink-400">
                📸
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-white tracking-tight">Instagram Command</h1>
                <span className="px-2.5 py-0.5 rounded-full bg-pink-500/10 border border-pink-500/30 text-pink-300 text-[10px] font-bold uppercase tracking-wider">
                  @kaptainkroeze
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Follower intelligence, Reel & Carousel performance, and weekly content recommendations.
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
              {syncing ? "Syncing IG Data..." : "Sync Instagram"}
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

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mt-8 pt-4 border-t border-zinc-800/80">
          {[
            { key: "analytics", label: "📊 Analytics & AI Performance", icon: "📊" },
            { key: "calendar", label: "📅 Instagram Content & Reels", icon: "📅" },
            { key: "competitors", label: "🔍 Competitor Reel Analysis", icon: "🔍" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as Tab)}
              className={cn(
                "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border",
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

      {draftCreatedMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold animate-in fade-in slide-in-from-top-2 duration-300 flex items-center justify-between">
          <span>{draftCreatedMsg}</span>
          <button onClick={() => setTab("calendar")} className="underline hover:text-white">
            View on Calendar →
          </button>
        </div>
      )}

      {/* 📊 TAB 1: ANALYTICS & DASHBOARD */}
      {tab === "analytics" && (
        <div className="space-y-6">
          {loading || !data ? (
            <div className="p-12 text-center text-zinc-500 text-sm">Loading Instagram metrics...</div>
          ) : (
            <>
              {/* Stat Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: "Total Followers", val: fmtNumber(data.summary.totalFollowers), badge: "+2.9%", color: "text-purple-400", sub: "Audience" },
                  { label: "New Followers", val: fmtNumber(data.summary.newFollowers), badge: "+25.5K", color: "text-emerald-400", sub: "60d Window" },
                  { label: "Total Reach", val: fmtNumber(data.summary.reach), badge: "10.7M", color: "text-pink-400", sub: "Accounts" },
                  { label: "Media Engagement", val: fmtNumber(data.summary.mediaEngagement), badge: "320.4K", color: "text-amber-400", sub: "Interactions" },
                  { label: "Profile Views", val: fmtNumber(data.summary.profileViews), badge: "252.1K", color: "text-sky-400", sub: "Visits" },
                  { label: "Link Clicks", val: fmtNumber(data.summary.linkClicks), badge: "53.0K", color: "text-blue-400", sub: "Conversions" },
                ].map((s, idx) => (
                  <div key={idx} className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 relative overflow-hidden group hover:border-pink-500/30 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{s.label}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">{s.badge}</span>
                    </div>
                    <div className={cn("text-2xl font-black tracking-tight mb-1", s.color)}>{s.val}</div>
                    <span className="text-[10px] text-zinc-600 font-medium">{s.sub}</span>
                  </div>
                ))}
              </div>

              {/* AI Weekly Recommendations */}
              <div className="rounded-3xl bg-gradient-to-b from-purple-900/20 to-zinc-900/80 border border-purple-500/30 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">✨</span>
                      <h2 className="text-base font-black text-white tracking-tight">AI Weekly Performance & Reel Recommendations</h2>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Based on actual @kaptainkroeze performance data (high reach reels vs conversion carousels).
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-bold uppercase tracking-wider border border-purple-500/30">
                    Weekly Action Plan
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
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
                        <p className="text-[10px] text-purple-300 mt-2">
                          💡 <strong>Why:</strong> {rec.reasoning}
                        </p>
                      </div>

                      <button
                        onClick={() => convertRecommendationToDraft(rec)}
                        className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2"
                      >
                        ⚡ Draft {rec.type === "reel" ? "Reel" : "Carousel"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Visualizations Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Chart 1: Daily Follower Growth */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">Daily Follower Growth & Peaks</h3>
                      <p className="text-[11px] text-zinc-500">Spikes vs cumulative total (June & July)</p>
                    </div>
                    <span className="text-xs font-bold text-emerald-400">+25.5K total</span>
                  </div>

                  <div className="h-44 flex items-end gap-2 pt-6 border-b border-zinc-800/80 pb-2">
                    {data.dailyGrowth.map((g, i) => {
                      const height = Math.max(15, (g.newFollowers / 2500) * 100);
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group relative">
                          <div
                            className="w-full bg-gradient-to-t from-purple-600 to-pink-500 rounded-t-md group-hover:brightness-125 transition-all"
                            style={{ height: `${height}%` }}
                          />
                          <span className="text-[9px] text-zinc-500 group-hover:text-zinc-300">{g.date}</span>
                          <div className="absolute -top-8 bg-zinc-950 border border-zinc-700 px-2 py-1 rounded text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                            +{g.newFollowers} followers
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Chart 2: Daily Profile Views vs Link Clicks */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">Daily Traffic: Profile Views & Clicks</h3>
                      <p className="text-[11px] text-zinc-500">June 20 peak: 19.8K link clicks</p>
                    </div>
                    <span className="text-xs font-bold text-sky-400">53.0K Total Clicks</span>
                  </div>

                  <div className="h-44 flex items-end gap-2 pt-6 border-b border-zinc-800/80 pb-2">
                    {data.dailyTraffic.map((t, i) => {
                      const vHeight = Math.max(10, (t.views / 20000) * 100);
                      const cHeight = Math.max(10, (t.clicks / 20000) * 100);
                      return (
                        <div key={i} className="flex-1 flex items-end gap-1 h-full justify-center group relative">
                          <div className="w-1.5 bg-sky-500 rounded-t-sm" style={{ height: `${vHeight}%` }} title={`Views: ${t.views}`} />
                          <div className="w-1.5 bg-blue-400 rounded-t-sm" style={{ height: `${cHeight}%` }} title={`Clicks: ${t.clicks}`} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-center gap-6 text-[11px] text-zinc-400">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-500" /> Profile Views</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" /> Link Clicks</span>
                  </div>
                </div>
              </div>

              {/* Demographics & Geography Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 space-y-4">
                  <h3 className="text-sm font-bold text-white">Audience Demographic</h3>
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-950 border border-zinc-800">
                    <div>
                      <div className="text-xl font-black text-purple-400">{data.demographics.topGenderAge.share}%</div>
                      <div className="text-xs text-zinc-300 font-bold">{data.demographics.topGenderAge.label}</div>
                    </div>
                    <span className="text-2xl">🎯</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Dominant audience segment aligns with decision-makers seeking business growth and team automation systems.
                  </p>
                </div>

                <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 space-y-4">
                  <h3 className="text-sm font-bold text-white">Top Audience Geography</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {data.demographics.topCountries.map((c) => (
                      <div key={c.code} className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-white">{c.country}</p>
                          <p className="text-[10px] text-zinc-500">{c.code}</p>
                        </div>
                        <span className="text-xs font-black text-pink-400">{c.share}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 📅 TAB 2: INSTAGRAM CONTENT & CALENDAR */}
      {tab === "calendar" && (
        <div className="space-y-6">
          {/* Quick Instagram Launcher */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white">⚡ Quick Instagram Planner</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                placeholder="Draft Reel topic or Carousel hook (e.g., 'How I scale with AI setters')..."
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-pink-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setQuickType("reel")}
                  className={cn(
                    "px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors",
                    quickType === "reel" ? "bg-pink-600 border-pink-500 text-white" : "bg-zinc-950 border-zinc-800 text-zinc-400"
                  )}
                >
                  🎬 Reel
                </button>
                <button
                  onClick={() => setQuickType("carousel")}
                  className={cn(
                    "px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors",
                    quickType === "carousel" ? "bg-purple-600 border-purple-500 text-white" : "bg-zinc-950 border-zinc-800 text-zinc-400"
                  )}
                >
                  🎠 Carousel
                </button>
                <button
                  onClick={addQuickInstagramContent}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 text-white text-xs font-bold shadow-lg shadow-pink-600/20 hover:brightness-110 transition-all"
                >
                  ＋ Add Draft
                </button>
              </div>
            </div>
          </div>

          {/* Instagram Content Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Instagram Planned & Draft Content ({items.length})</h3>
              <div className="flex gap-2">
                {(["all", "reel", "carousel"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormatFilter(f)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-colors",
                      formatFilter === f ? "bg-pink-500/20 border-pink-500/40 text-pink-200" : "bg-zinc-900 border-zinc-800 text-zinc-500"
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {items.length === 0 ? (
              <div className="p-12 text-center rounded-3xl bg-zinc-900/40 border border-zinc-800 text-zinc-500 text-xs">
                No Instagram content planned yet. Use the Quick Planner above or AI Recommendations in the Analytics tab!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item) => (
                  <div key={item.id} className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-3 hover:border-pink-500/30 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-pink-500/10 text-pink-300 border border-pink-500/20">
                        {item.creative_type === "video" ? "🎬 Reel" : "🎠 Carousel"}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-semibold">{item.status}</span>
                    </div>
                    <h4 className="text-sm font-bold text-white line-clamp-2">{item.title}</h4>
                    {item.meta?.hook && (
                      <p className="text-[11px] text-zinc-400 bg-zinc-950 p-2 rounded-xl border border-zinc-800/80 italic">
                        "{item.meta.hook}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🔍 TAB 3: COMPETITOR ANALYSIS */}
      {tab === "competitors" && (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-200 text-xs font-semibold">
            💡 <strong>Competitor Reel Intelligence:</strong> Study competitor hooks, pillars, and signature patterns to model high-converting Reels into Andrew's voice.
          </div>
          <CompetitorResearch />
        </div>
      )}
    </div>
  );
}
