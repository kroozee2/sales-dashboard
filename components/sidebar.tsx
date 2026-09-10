"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

// `match` lists extra route prefixes that keep this item highlighted — used
// where one sidebar entry fronts a group of sub-tabbed pages.
// `tab` marks entries that share a path and differ only by ?tab=. `tabDefault`
// is the one that lights up when the URL carries no tab (or an unlisted one).
type NavItem = { href: string; label: string; emoji: string; match?: string[]; section?: string; tab?: string; tabDefault?: boolean };

// The order sections render in: the work first, then the reference material.
const SECTIONS = ["Command", "AI Workforce", "Marketing", "Leads", "Sales", "Clients", "Partners", "Finances", "Offers", "Team"];

const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Dashboard", emoji: "🏠", section: "Command" },
  { href: "/morning-brief", label: "Brief", emoji: "☀️", section: "Command" },
  { href: "/goals", label: "Goals", emoji: "🏁", section: "Command" },
  { href: "/projects", label: "Projects", emoji: "🗂️", section: "Command" },
  { href: "/tasks", label: "Tasks", emoji: "📋", section: "Command" },
  { href: "/winning-formula", label: "Winning", emoji: "🔥", section: "Command" },

  { href: "/leads?tab=data", label: "Dashboard", emoji: "📊", tab: "data", section: "Leads" },
  { href: "/leads", label: "Leads", emoji: "🎯", tab: "leads", tabDefault: true, match: ["/scripts"], section: "Leads" },
  { href: "/leads?tab=new", label: "New Leads", emoji: "🌱", tab: "new", section: "Leads" },
  { href: "/leads?tab=hotlist", label: "Hot List", emoji: "🔥", tab: "hotlist", section: "Leads" },
  { href: "/hot-leads", label: "AI Hot List", emoji: "🤖", match: ["/instagram-hot-leads"], section: "Leads" },
  { href: "/leads?tab=followup", label: "Follow-Up", emoji: "🔁", tab: "followup", section: "Leads" },
  { href: "/messages", label: "Messages", emoji: "💬", section: "Leads" },
  { href: "/signups", label: "Signups", emoji: "🆕", section: "Leads" },
  { href: "/applications", label: "Applications", emoji: "📝", section: "Leads" },
  { href: "/masterclass", label: "Masterclass", emoji: "🎓", section: "Leads" },
  { href: "/event-leads", label: "Event Leads", emoji: "🎟️", section: "Leads" },

  { href: "/calls?tab=data", label: "Dashboard", emoji: "📊", tab: "data", section: "Sales" },
  { href: "/calls", label: "Calendar", emoji: "📅", tab: "calendar", tabDefault: true, section: "Sales" },
  { href: "/calls?tab=calls", label: "List", emoji: "📋", tab: "calls", section: "Sales" },
  { href: "/follow-ups", label: "Follow-Ups", emoji: "🔥", section: "Sales" },

  { href: "/content?tab=dashboard", label: "Dashboard", emoji: "📊", tab: "dashboard", section: "Marketing" },
  { href: "/content?tab=events", label: "Events", emoji: "🎟️", tab: "events", section: "Marketing" },
  { href: "/content", label: "Calendar", emoji: "🗓️", tab: "calendar", tabDefault: true, section: "Marketing" },
  { href: "/content?tab=ideas", label: "Ideas", emoji: "💡", tab: "ideas", section: "Marketing" },
  { href: "/instagram", label: "Instagram", emoji: "📸", section: "Marketing" },
  { href: "/youtube", label: "YouTube", emoji: "▶️", section: "Marketing" },
  { href: "/funnels", label: "Funnels", emoji: "🌀", section: "Marketing" },
  { href: "/content?tab=proof", label: "Proof", emoji: "🏆", tab: "proof", section: "Marketing" },
  { href: "/content?tab=posted", label: "Posted", emoji: "☑️", tab: "posted", section: "Marketing" },

  { href: "/clients/dashboard", label: "Dashboard", emoji: "📊", section: "Clients" },
  { href: "/clients/new", label: "New Clients", emoji: "🌟", section: "Clients" },
  { href: "/clients/members", label: "Members", emoji: "👥", section: "Clients" },
  { href: "/client-calls", label: "Client Calls", emoji: "🧑‍💼", section: "Clients" },
  { href: "/clients/group-calls", label: "Group Calls", emoji: "🎥", section: "Clients" },
  { href: "/clients/calendar", label: "Calendar", emoji: "📅", section: "Clients" },

  { href: "/partners/list", label: "Partners", emoji: "🤝", section: "Partners" },
  { href: "/partners", label: "Calendar", emoji: "📅", tab: "calendar", tabDefault: true, section: "Partners" },
  { href: "/partners?tab=calls", label: "List", emoji: "📋", tab: "calls", section: "Partners" },
  { href: "/partners?tab=data", label: "Dashboard", emoji: "📊", tab: "data", section: "Partners" },
  { href: "/partners/referral-party", label: "Referral Party", emoji: "🎉", section: "Partners" },

  { href: "/revenue", label: "Dashboard", emoji: "📊", tab: "dashboard", tabDefault: true, section: "Finances" },
  { href: "/revenue?tab=sales", label: "Recent Sales", emoji: "🧾", tab: "sales", section: "Finances" },
  { href: "/revenue?tab=mrr", label: "MRR", emoji: "🔁", tab: "mrr", section: "Finances" },
  { href: "/revenue?tab=low", label: "Low Ticket", emoji: "🎟", tab: "low", section: "Finances" },

  { href: "/jarvis", label: "Jarvis", emoji: "🤖", tab: "jarvis", tabDefault: true, section: "AI Workforce" },
  { href: "/jarvis?tab=core", label: "Core Agents", emoji: "🧠", tab: "core", section: "AI Workforce" },
  { href: "/jarvis?tab=subagent", label: "Sub-agents", emoji: "🛠️", tab: "subagent", section: "AI Workforce" },

  { href: "/offer-lab", label: "Offer Lab", emoji: "📦", section: "Offers" },
  { href: "/messaging", label: "Messaging", emoji: "🧠", section: "Offers" },

  { href: "/team", label: "Team", emoji: "👥", section: "Team" },
  { href: "/playbook", label: "Playbook", emoji: "📋", section: "Team" },
  { href: "/resources", label: "Resources", emoji: "🎁", match: ["/two-step"], section: "Team" },
  { href: "/install", label: "Install App", emoji: "📲" },
];

// Whether a nav item should show as active for the current path.
function isActive(n: NavItem, pathname: string, activeTab: string | null): boolean {
  const hrefPath = n.href.split("?")[0];
  const onPath = pathname === hrefPath || pathname.startsWith(hrefPath + "/");

  if (onPath && n.tab) {
    // Among entries sharing this path, the one matching ?tab= wins. If the URL
    // carries no tab, or one nothing claims, the default entry lights up.
    const siblings = NAV_ITEMS.filter((x) => x.href.split("?")[0] === hrefPath && x.tab);
    if (activeTab && siblings.some((x) => x.tab === activeTab)) return n.tab === activeTab;
    return !!n.tabDefault;
  }
  if (onPath) return true;
  return (n.match ?? []).some((m) => pathname === m || pathname.startsWith(m + "/"));
}

const SETTINGS: NavItem = { href: "/settings", label: "Settings", emoji: "⚙️" };

// Mobile bottom tab bar — the 5 primary destinations (Monarch-style)
const BOTTOM_NAV: NavItem[] = [
  { href: "/home", label: "Dashboard", emoji: "🏠" },
  { href: "/calls", label: "Calls", emoji: "📞" },
  { href: "/leads", label: "Leads", emoji: "🎯" },
  { href: "/tasks", label: "Tasks", emoji: "📋" },
  { href: "/goals", label: "Goals", emoji: "🏁" },
];

export function BottomNav() {
  const pathname = usePathname() ?? "";
  // The login screen renders before the visitor is authenticated — don't show
  // them the app's structure (or Andrew's name) on the way in.
  if (pathname === "/login") return null;
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 flex items-stretch border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      {BOTTOM_NAV.map((n) => {
        const active = pathname === n.href || pathname.startsWith(n.href + "/");
        return (
          <Link
            key={n.href}
            href={n.href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              active ? "text-blue-400" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <span className="text-xl leading-none">{n.emoji}</span>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/home" className="flex items-center gap-2.5 px-5 py-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg">
        <span className="text-sm font-extrabold text-white tracking-tight">7F</span>
      </div>
      <div className="leading-tight">
        <div className="text-sm font-bold text-white tracking-tight">
          Sales <span className="text-blue-400">OS</span>
        </div>
        <div className="text-[10px] tracking-[0.25em] text-zinc-600 uppercase">7-Figure CEO</div>
      </div>
    </Link>
  );
}

function NavList({ pathname, activeTab, onNavigate }: { pathname: string; activeTab: string | null; onNavigate?: () => void }) {
  const sections = SECTIONS;
  // Every section starts open — derived from the list so adding a section here
  // can't silently leave it collapsed.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    () => Object.fromEntries(sections.map((s) => [s, true])),
  );

  const toggleSection = (section: string) => {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <nav className="flex-1 overflow-y-auto px-3 space-y-2 pb-4 no-scrollbar">
      {sections.map((section) => {
        const items = NAV_ITEMS.filter((n) => n.section === section);
        if (items.length === 0) return null;
        const isExpanded = expanded[section];
        const sectionId = section.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const hasActiveChild = items.some((n) => isActive(n, pathname, activeTab));

        return (
          <div key={section} className="space-y-0.5">
            <button
              onClick={() => toggleSection(section)}
              aria-expanded={isExpanded}
              aria-controls={`sidebar-section-${sectionId}`}
              className="min-h-11 w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              <span>{section}</span>
              <span aria-hidden="true" className={cn("transition-transform duration-200", isExpanded ? "rotate-180" : "")}>
                ▼
              </span>
            </button>

            {/* grid-rows animates to the content's own height. The fixed
                max-height this replaces silently clipped any section that grew
                past it, and Leads is already ten items deep. */}
            <div
              id={`sidebar-section-${sectionId}`}
              className={cn("grid transition-all duration-200", isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}
            >
              <div className="space-y-0.5 overflow-hidden">
              {items.map((n) => {
                const active = isActive(n, pathname, activeTab);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={onNavigate}
                    className={cn(
                      "relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150",
                      active ? "bg-blue-600/20 text-blue-200" : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100"
                    )}
                  >
                    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-blue-400" />}
                    <span className="text-lg leading-none">{n.emoji}</span>
                    {n.label}
                  </Link>
                );
              })}
              </div>
            </div>

            {!isExpanded && hasActiveChild && (
              <div className="mx-3 h-0.5 rounded-full bg-blue-500/40 animate-pulse" />
            )}
          </div>
        );
      })}

      {/* Unsectioned items */}
      <div className="space-y-0.5 pt-2">
        {NAV_ITEMS.filter((n) => !n.section).map((n) => {
          const active = isActive(n, pathname, activeTab);
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={onNavigate}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150",
                active ? "bg-blue-600/20 text-blue-200" : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100"
              )}
            >
              {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-blue-400" />}
              <span className="text-lg leading-none">{n.emoji}</span>
              {n.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Footer({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const active = pathname.startsWith(SETTINGS.href);
  return (
    <div className="px-3 py-3 border-t border-zinc-800 space-y-1">
      <Link
        href={SETTINGS.href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          active ? "bg-blue-600/20 text-blue-200" : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100"
        )}
      >
        <span className="text-lg leading-none">{SETTINGS.emoji}</span>
        {SETTINGS.label}
      </Link>
      <div className="flex items-center gap-2.5 px-3 py-2">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow flex-shrink-0">
          <span className="text-xs font-bold text-white">AK</span>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">Andrew Kroeze</div>
          <div className="text-[11px] text-zinc-600">7-Figure CEO</div>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab");
  const [open, setOpen] = useState(false);

  // See BottomNav: no app chrome on the login screen.
  if (pathname === "/login") return null;

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 h-screen sticky top-0 border-r border-zinc-800 bg-zinc-900/60 backdrop-blur">
        <Brand />
        <NavList pathname={pathname} activeTab={activeTab} />
        <Footer pathname={pathname} />
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-50 flex items-center justify-between px-4 h-14 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800">
        <button onClick={() => setOpen(true)} className="text-2xl text-zinc-300 leading-none -ml-1 px-1">☰</button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600">
            <span className="text-[10px] font-extrabold text-white">7F</span>
          </div>
          <span className="text-sm font-bold text-white">Sales <span className="text-blue-400">OS</span></span>
        </div>
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
          <span className="text-xs font-bold text-white">AK</span>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <aside onClick={(e) => e.stopPropagation()} className="flex flex-col w-72 h-full bg-zinc-950 border-r border-zinc-800">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white text-2xl leading-none">×</button>
            </div>
            <NavList pathname={pathname} activeTab={activeTab} onNavigate={() => setOpen(false)} />
            <Footer pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
