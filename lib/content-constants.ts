// Client-safe content constants (no server-only imports). Shared by the page + engine.

export type Platform = "instagram" | "instagram_post" | "carousel" | "youtube" | "email" | "facebook" | "skool" | "skool_paid" | "whatsapp";
export const PLATFORMS: { key: Platform; label: string; emoji: string }[] = [
  { key: "instagram", label: "IG Reel", emoji: "🎬" },
  { key: "instagram_post", label: "IG Post", emoji: "📸" },
  { key: "carousel", label: "Carousel", emoji: "🎠" },
  { key: "youtube", label: "YouTube", emoji: "▶️" },
  { key: "email", label: "Email", emoji: "✉️" },
  { key: "facebook", label: "Facebook", emoji: "📘" },
  { key: "skool", label: "Skool", emoji: "🎓" },
  { key: "skool_paid", label: "Paid Skool", emoji: "💎" },
  { key: "whatsapp", label: "WhatsApp", emoji: "📱" },
];
export const platformLabel = (p: string) => PLATFORMS.find((x) => x.key === p)?.label ?? p;
export const platformEmoji = (p: string) => PLATFORMS.find((x) => x.key === p)?.emoji ?? "📝";

// Per-platform color — so the calendar shows at a glance where a piece is going.
// Full static class strings (Tailwind can't see dynamically-built names).
const PLATFORM_CHIP: Record<string, string> = {
  instagram: "bg-fuchsia-500/15 border-fuchsia-500/45 text-fuchsia-100",
  instagram_post: "bg-pink-500/15 border-pink-500/45 text-pink-100",
  carousel: "bg-orange-500/15 border-orange-500/45 text-orange-100",
  youtube: "bg-red-500/15 border-red-500/45 text-red-100",
  email: "bg-sky-500/15 border-sky-500/45 text-sky-100",
  facebook: "bg-blue-500/15 border-blue-500/45 text-blue-100",
  skool: "bg-violet-500/15 border-violet-500/45 text-violet-100",
  skool_paid: "bg-indigo-500/15 border-indigo-500/45 text-indigo-100",
  whatsapp: "bg-green-500/15 border-green-500/45 text-green-100",
};
export const platformChip = (p: string) => PLATFORM_CHIP[p] ?? "bg-zinc-800/60 border-zinc-700/60 text-zinc-200";
const PLATFORM_DOT: Record<string, string> = {
  instagram: "bg-fuchsia-500", instagram_post: "bg-pink-500", carousel: "bg-orange-500",
  youtube: "bg-red-500", email: "bg-sky-500", facebook: "bg-blue-500", skool: "bg-violet-500",
  skool_paid: "bg-indigo-500", whatsapp: "bg-green-500",
};
export const platformDot = (p: string) => PLATFORM_DOT[p] ?? "bg-zinc-500";

export type Category = "connection" | "value" | "proof" | "action" | "question";
export const CATEGORIES: { key: Category; label: string; emoji: string; color: string }[] = [
  { key: "value", label: "Value", emoji: "🔥", color: "blue" },
  { key: "connection", label: "Connection", emoji: "📖", color: "emerald" },
  { key: "proof", label: "Proof", emoji: "🎉", color: "violet" },
  { key: "action", label: "CTA", emoji: "🆕", color: "pink" },
  { key: "question", label: "Question", emoji: "❓", color: "amber" },
];
export const categoryMeta = (k: string) => CATEGORIES.find((c) => c.key === k) ?? CATEGORIES[0];

export const REEL_PILLARS: { key: string; label: string }[] = [
  { key: "auto", label: "Best fit" },
  { key: "demo", label: "Demo / build" },
  { key: "listicle", label: "Listicle" },
  { key: "hottake", label: "Hot take" },
  { key: "story", label: "Story" },
  { key: "watch", label: "Watch this" },
  { key: "fix", label: "Mistake → Fix" },
  { key: "framework", label: "Framework" },
  { key: "tip", label: "Quick tip" },
];

export const EVENT_TYPES: { key: string; label: string }[] = [
  { key: "free_webinar", label: "Free Webinar" },
  { key: "paid_webinar", label: "Paid Webinar" },
  { key: "paid_trial", label: "$47 Paid Trial" },
  { key: "limited_spots", label: "Limited Spots" },
  { key: "in_person", label: "In-Person Event" },
  { key: "jv_workshop", label: "JV Workshop" },
  { key: "challenge", label: "Challenge" },
];

export const CONTENT_STATUSES = [
  { key: "idea", label: "Idea", emoji: "💡", dot: "bg-zinc-500" },
  { key: "drafted", label: "Drafted", emoji: "✍️", dot: "bg-amber-400" },
  { key: "scheduled", label: "Scheduled", emoji: "📆", dot: "bg-blue-400" },
  { key: "posted", label: "Posted", emoji: "✅", dot: "bg-emerald-400" },
];
export const statusMeta = (k: string) => CONTENT_STATUSES.find((s) => s.key === k) ?? CONTENT_STATUSES[0];
