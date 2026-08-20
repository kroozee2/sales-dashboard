"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

// `match` lists extra route prefixes that keep this item highlighted — used
// where one sidebar entry fronts a group of sub-tabbed pages.
type NavItem = { href: string; label: string; emoji: string; match?: string[]; section?: string };

const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Dashboard", emoji: "🏠", section: "Command" },
  { href: "/jarvis", label: "Jarvis", emoji: "🤖", section: "Command" },
  { href: "/goals", label: "Goals", emoji: "🏁", section: "Command" },

  { href: "/content", label: "Content", emoji: "✍️", section: "Growth" },
  { href: "/instagram", label: "Instagram", emoji: "📸", match: ["/instagram-hot-leads"], section: "Growth" },
  { href: "/leads", label: "Leads", emoji: "🎯", match: ["/messages", "/scripts", "/signups", "/applications", "/instagram-hot-leads"], section: "Growth" },
  { href: "/calls", label: "Calls", emoji: "📞", section: "Growth" },
  { href: "/revenue", label: "Revenue", emoji: "💰", section: "Growth" },

  { href: "/offer-lab", label: "Offer Lab", emoji: "📦", section: "Backend" },
  { href: "/tasks", label: "Execution", emoji: "⚡", match: ["/projects", "/winning-formula"], section: "Backend" },
  { href: "/team", label: "Team", emoji: "👥", section: "Backend" },

  { href: "/playbook", label: "Playbook", emoji: "📋", section: "Vault" },
  { href: "/resources", label: "Resources", emoji: "🎁", match: ["/two-step"], section: "Vault" },
  { href: "/install", label: "Install App", emoji: "📲" },
];

// Whether a nav item should show as active for the current path.
function isActive(n: NavItem, pathname: string): boolean {
  if (pathname === n.href || pathname.startsWith(n.href + "/")) return true;
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
  const pathname = usePathname();
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

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const sections = ["Command", "Growth", "Backend", "Vault"];
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    Command: true,
    Growth: true,
    Backend: true,
    Vault: true,
  });

  const toggleSection = (section: string) => {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <nav className="flex-1 overflow-y-auto px-3 space-y-2 pb-4 no-scrollbar">
      {sections.map((section) => {
        const items = NAV_ITEMS.filter((n) => n.section === section);
        if (items.length === 0) return null;
        const isExpanded = expanded[section];
        const hasActiveChild = items.some((n) => isActive(n, pathname));

        return (
          <div key={section} className="space-y-0.5">
            <button
              onClick={() => toggleSection(section)}
              className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              <span>{section}</span>
              <span className={cn("transition-transform duration-200", isExpanded ? "rotate-180" : "")}>
                ▼
              </span>
            </button>
            
            <div className={cn("space-y-0.5 overflow-hidden transition-all duration-200", isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0")}>
              {items.map((n) => {
                const active = isActive(n, pathname);
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
            
            {!isExpanded && hasActiveChild && (
              <div className="mx-3 h-0.5 rounded-full bg-blue-500/40 animate-pulse" />
            )}
          </div>
        );
      })}
      
      {/* Unsectioned items */}
      <div className="space-y-0.5 pt-2">
        {NAV_ITEMS.filter((n) => !n.section).map((n) => {
          const active = isActive(n, pathname);
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
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // See BottomNav: no app chrome on the login screen.
  if (pathname === "/login") return null;

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 h-screen sticky top-0 border-r border-zinc-800 bg-zinc-900/60 backdrop-blur">
        <Brand />
        <NavList pathname={pathname} />
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
            <NavList pathname={pathname} onNavigate={() => setOpen(false)} />
            <Footer pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
