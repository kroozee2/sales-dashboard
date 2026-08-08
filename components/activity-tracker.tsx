"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Friendly names so the Team feed reads "Opened Leads" rather than "Opened /leads".
const LABELS: Record<string, string> = {
  "/home": "Home", "/content": "Content", "/leads": "Leads", "/messages": "Messages",
  "/calls": "Calls", "/revenue": "Revenue", "/offer-lab": "Offers", "/goals": "Goals",
  "/tasks": "Tasks", "/projects": "Projects", "/winning-formula": "Winning",
  "/resources": "Resources", "/two-step": "Two-Step", "/scripts": "Scripts",
  "/playbook": "Playbook", "/team": "Team", "/settings": "Settings",
};

/**
 * Records which pages the signed-in teammate opens, for the Team activity feed.
 * Fire-and-forget: the server dedupes repeat views inside 10 minutes and drops
 * anything from a session it can't identify, so this never blocks the UI.
 */
export function ActivityTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname === "/login") return;
    const label = LABELS[pathname];
    const t = setTimeout(() => {
      void fetch("/api/team/activity", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: pathname, label }),
        keepalive: true,
      }).catch(() => {});
    }, 1200); // only count a page you actually stayed on
    return () => clearTimeout(t);
  }, [pathname]);
  return null;
}
