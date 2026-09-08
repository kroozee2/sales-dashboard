"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PlatformsPanel } from "@/components/platforms-panel";
import { TopContent } from "@/components/top-content";
import type { Posted } from "@/components/posted-table";

// Marketing → Dashboard. Three questions, one per tab: how are we doing overall,
// how big is the audience, and what content actually worked.

const TABS = [
  { key: "overview", label: "Overview", emoji: "📊" },
  { key: "platforms", label: "Platforms", emoji: "🌐" },
  { key: "content", label: "Posted Content", emoji: "🏆" },
] as const;

export function MarketingDashboard({ overview, posted }: { overview: ReactNode; posted: Posted[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("overview");

  return (
    <div className="space-y-5">
      {/* The page header already names this view, so the tabs stand alone
          rather than repeating the title underneath itself. */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex gap-1 rounded-xl bg-zinc-900 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn("rounded-lg px-3.5 py-2 text-xs font-bold transition-colors",
                tab === t.key ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white")}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && overview}
      {tab === "platforms" && <PlatformsPanel />}
      {tab === "content" && <TopContent posted={posted} />}
    </div>
  );
}
