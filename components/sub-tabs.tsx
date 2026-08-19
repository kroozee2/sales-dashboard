"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePerson, type Person } from "@/lib/use-person";

type Tab = { href: string; label: string; emoji: string };

// Sub-navigation groups — a single sidebar entry expands into these pill tabs
// at the top of each page so you can click straight across related sections.
export const SUB_TAB_GROUPS: Record<string, Tab[]> = {
  leads: [
    { href: "/leads", label: "Leads", emoji: "🎯" },
    { href: "/instagram-hot-leads", label: "IG Hot Leads", emoji: "🔥" },
    { href: "/messages", label: "Messages", emoji: "💬" },
    { href: "/scripts", label: "Scripts", emoji: "💬" },
    { href: "/signups", label: "Signups", emoji: "🆕" },
    { href: "/applications", label: "Applications", emoji: "📝" },
  ],
  tasks: [
    { href: "/tasks", label: "Tasks", emoji: "📋" },
    { href: "/projects", label: "Projects", emoji: "🗂️" },
    { href: "/winning-formula", label: "Winning", emoji: "🔥" },
  ],
  resources: [
    { href: "/resources", label: "Resources", emoji: "🎁" },
    { href: "/two-step", label: "Two-Step", emoji: "🔗" },
  ],
};

export function SubTabs({ group, className }: { group: keyof typeof SUB_TAB_GROUPS; className?: string }) {
  const pathname = usePathname();
  const tabs = SUB_TAB_GROUPS[group];
  if (!tabs) return null;
  return (
    // On a phone the tabs plus the person selector are wider than the screen, so
    // the selector drops to its own row rather than clipping a tab out of reach.
    <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5", className)}>
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                active
                  ? "bg-blue-600/20 text-blue-200 ring-1 ring-blue-500/30"
                  : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100"
              )}
            >
              <span className="text-base leading-none">{t.emoji}</span>
              {t.label}
            </Link>
          );
        })}
      </div>
      {group === "tasks" && <div className="flex sm:block"><PersonSelect /></div>}
    </div>
  );
}

// Shared Both / Andrew / Jameson selector — drives Tasks, Winning Formula, KPIs.
function PersonSelect() {
  const [person, setPerson] = usePerson();
  const OPTS: { k: Person; label: string; title: string }[] = [
    { k: "all", label: "Both", title: "Both" },
    { k: "Andrew", label: "🧔", title: "Andrew" },
    { k: "Jameson", label: "🧑", title: "Jameson" },
  ];
  return (
    <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 flex-shrink-0">
      {OPTS.map((o) => (
        <button
          key={o.k}
          onClick={() => setPerson(o.k)}
          title={o.title}
          className={cn(
            // roomier on a phone so it's a comfortable thumb target
            "px-4 py-2 sm:px-2.5 sm:py-1 rounded-lg text-sm sm:text-xs font-medium transition-colors",
            person === o.k ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
