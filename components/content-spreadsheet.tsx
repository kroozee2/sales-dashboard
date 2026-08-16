"use client";

import { useMemo, useState } from "react";
import {
  CATEGORIES,
  CONTENT_STATUSES,
  PLATFORMS,
  categoryMeta,
  platformEmoji,
  platformLabel,
  statusMeta,
} from "@/lib/content-constants";
import {
  CONTENT_SCHEDULE_GROUPS,
  groupContentBySchedule,
  moveContentToScheduleGroup,
  type ContentScheduleGroup,
} from "@/lib/content-spreadsheet";

export interface ContentSpreadsheetItem {
  id: string;
  title: string;
  category: string;
  status: string;
  scheduled_date: string | null;
  platforms: string[];
  drafts: Record<string, string>;
  meta: Record<string, unknown>;
  media_urls: string[];
  creative_type: string | null;
  video_script: string | null;
  created_at: string;
}

type ItemPatch = Partial<ContentSpreadsheetItem>;

const GROUP_META: Record<ContentScheduleGroup, { label: string; helper: string; icon: string; accent: string; empty: string }> = {
  overdue: {
    label: "Overdue",
    helper: "Needs a new date or to be posted",
    icon: "⚠️",
    accent: "border-rose-500/40 bg-rose-500/[0.05]",
    empty: "Nothing overdue",
  },
  today: {
    label: "Due today",
    helper: "Your publishing queue for today",
    icon: "🎯",
    accent: "border-amber-500/40 bg-amber-500/[0.05]",
    empty: "Nothing due today",
  },
  upcoming: {
    label: "Upcoming",
    helper: "Everything scheduled after today",
    icon: "📅",
    accent: "border-blue-500/30 bg-blue-500/[0.04]",
    empty: "Nothing upcoming",
  },
  unscheduled: {
    label: "Unscheduled",
    helper: "Ideas and drafts that still need a date",
    icon: "📥",
    accent: "border-zinc-700 bg-zinc-900/60",
    empty: "Nothing waiting for a date",
  },
};

function todayLocal() {
  const value = new Date();
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readiness(item: ContentSpreadsheetItem) {
  const hasCopy = Boolean(item.video_script?.trim()) || Object.values(item.drafts || {}).some((draft) => draft?.trim());
  const hasMedia = (item.media_urls || []).length > 0;
  if (hasCopy && hasMedia) return { label: "Ready", className: "text-emerald-300 bg-emerald-500/10 border-emerald-500/25" };
  if (hasCopy) return { label: "Copy ready", className: "text-blue-300 bg-blue-500/10 border-blue-500/25" };
  if (hasMedia) return { label: "Media ready", className: "text-violet-300 bg-violet-500/10 border-violet-500/25" };
  return { label: "Needs work", className: "text-zinc-400 bg-zinc-800 border-zinc-700" };
}

function formatLabel(item: ContentSpreadsheetItem) {
  const metaFormat = typeof item.meta?.format === "string" ? item.meta.format : "";
  return metaFormat || item.creative_type || item.platforms.map(platformLabel).join(" + ") || "Not set";
}

export default function ContentSpreadsheet({
  items,
  onOpen,
  onPatch,
  onDelete,
}: {
  items: ContentSpreadsheetItem[];
  onOpen: (item: ContentSpreadsheetItem) => void;
  onPatch: (id: string, patch: ItemPatch) => Promise<ContentSpreadsheetItem | null>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const today = todayLocal();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropGroup, setDropGroup] = useState<ContentScheduleGroup | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveErrorId, setSaveErrorId] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<ContentSpreadsheetItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState(false);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return items.filter((item) => {
      if (item.status === "posted") return false;
      if (category !== "all" && item.category !== category) return false;
      if (platform !== "all" && !item.platforms.includes(platform)) return false;
      if (status !== "all" && item.status !== status) return false;
      if (search && !`${item.title} ${formatLabel(item)} ${item.platforms.join(" ")}`.toLowerCase().includes(search)) return false;
      return true;
    });
  }, [items, query, category, platform, status]);

  const groups = useMemo(() => groupContentBySchedule(filtered, today), [filtered, today]);
  const total = CONTENT_SCHEDULE_GROUPS.reduce((sum, group) => sum + groups[group].length, 0);

  async function patch(id: string, value: ItemPatch) {
    setSavingId(id);
    setSaveErrorId(null);
    try {
      const updated = await onPatch(id, value);
      if (!updated) setSaveErrorId(id);
    } catch {
      setSaveErrorId(id);
    } finally {
      setSavingId(null);
    }
  }

  function dropInto(group: ContentScheduleGroup) {
    if (!dragId) return;
    void patch(dragId, { scheduled_date: moveContentToScheduleGroup(group, today) });
    setDragId(null);
    setDropGroup(null);
  }

  async function confirmDelete() {
    if (!confirmItem || deletingId) return;
    setDeletingId(confirmItem.id);
    setDeleteError(false);
    try {
      const deleted = await onDelete(confirmItem.id);
      if (!deleted) {
        setDeleteError(true);
        return;
      }
      setConfirmItem(null);
    } catch {
      setDeleteError(true);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {CONTENT_SCHEDULE_GROUPS.map((group) => {
          const meta = GROUP_META[group];
          return (
            <a key={group} href={`#content-${group}`} className={`rounded-2xl border px-4 py-3 transition-colors hover:brightness-125 ${meta.accent}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-400">{meta.icon} {meta.label}</span>
                <span className="text-xl font-bold text-white tabular-nums">{groups[group].length}</span>
              </div>
            </a>
          );
        })}
      </div>

      <div className="sticky top-0 z-20 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-3 shadow-xl backdrop-blur">
        <div className="flex flex-col xl:flex-row xl:items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <span className="absolute left-3 top-2.5 text-zinc-600 text-sm">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search content or format…"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-zinc-300 focus:border-blue-500 focus:outline-none">
              <option value="all">All categories</option>
              {CATEGORIES.map((entry) => <option key={entry.key} value={entry.key}>{entry.emoji} {entry.label}</option>)}
            </select>
            <select aria-label="Filter by platform" value={platform} onChange={(event) => setPlatform(event.target.value)} className="rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-zinc-300 focus:border-blue-500 focus:outline-none">
              <option value="all">All types</option>
              {PLATFORMS.map((entry) => <option key={entry.key} value={entry.key}>{entry.emoji} {entry.label}</option>)}
            </select>
            <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-zinc-300 focus:border-blue-500 focus:outline-none">
              <option value="all">All statuses</option>
              {CONTENT_STATUSES.filter((entry) => entry.key !== "posted").map((entry) => <option key={entry.key} value={entry.key}>{entry.emoji} {entry.label}</option>)}
            </select>
          </div>
          <span className="text-xs text-zinc-500 whitespace-nowrap">{total} active piece{total === 1 ? "" : "s"}</span>
        </div>
      </div>

      <p className="text-xs text-zinc-500 px-1">Edit any cell directly. Drag a row onto another section to move it to yesterday, today, tomorrow, or unscheduled.</p>

      {CONTENT_SCHEDULE_GROUPS.map((group) => {
        const meta = GROUP_META[group];
        const rows = groups[group];
        const activeDrop = dropGroup === group;
        return (
          <section id={`content-${group}`} key={group}
            onDragOver={(event) => { if (dragId) { event.preventDefault(); setDropGroup(group); } }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropGroup(null); }}
            onDrop={(event) => { event.preventDefault(); dropInto(group); }}
            className={`scroll-mt-24 overflow-hidden rounded-2xl border transition-all ${activeDrop ? "border-blue-400 bg-blue-500/10 ring-2 ring-blue-500/30" : meta.accent}`}>
            <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-white">{meta.icon} {meta.label} <span className="text-zinc-500 font-medium">({rows.length})</span></h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">{activeDrop ? `Drop here to move to ${meta.label.toLowerCase()}` : meta.helper}</p>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className={`px-4 py-8 text-center text-sm ${activeDrop ? "text-blue-300" : "text-zinc-600"}`}>{activeDrop ? "Drop the content here" : `✓ ${meta.empty}`}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-zinc-800/80 bg-black/10 text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                      <th className="w-8 px-2 py-2" aria-label="Drag" />
                      <th className="min-w-[300px] px-2 py-2 font-semibold">Content</th>
                      <th className="w-[150px] px-2 py-2 font-semibold">Date</th>
                      <th className="w-[150px] px-2 py-2 font-semibold">Category</th>
                      <th className="w-[180px] px-2 py-2 font-semibold">Type / channel</th>
                      <th className="w-[135px] px-2 py-2 font-semibold">Status</th>
                      <th className="w-[110px] px-2 py-2 font-semibold">Readiness</th>
                      <th className="w-[105px] px-2 py-2" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item) => {
                      const ready = readiness(item);
                      const cat = categoryMeta(item.category);
                      const itemStatus = statusMeta(item.status);
                      return (
                        <tr key={item.id} draggable
                          onDragStart={(event) => { event.dataTransfer.setData("text/plain", item.id); event.dataTransfer.effectAllowed = "move"; setDragId(item.id); }}
                          onDragEnd={() => { setDragId(null); setDropGroup(null); }}
                          className={`group border-b border-zinc-800/60 last:border-b-0 hover:bg-white/[0.025] ${dragId === item.id ? "opacity-40" : ""}`}>
                          <td className="px-2 py-2 text-center text-zinc-700 cursor-grab active:cursor-grabbing" title="Drag to another section">⠿</td>
                          <td className="px-2 py-2">
                            <input defaultValue={item.title} key={`${item.id}-${item.title}`} onBlur={(event) => { const value = event.target.value.trim(); if (value && value !== item.title) void patch(item.id, { title: value }); }}
                              aria-label={`Content title: ${item.title}`} className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-medium text-zinc-100 hover:border-zinc-800 focus:border-blue-500 focus:bg-zinc-950 focus:outline-none" />
                          </td>
                          <td className="px-2 py-2">
                            <input type="date" value={item.scheduled_date ?? ""} onChange={(event) => void patch(item.id, { scheduled_date: event.target.value || null })}
                              aria-label={`Scheduled date for ${item.title}`} className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 focus:border-blue-500 focus:outline-none" />
                          </td>
                          <td className="px-2 py-2">
                            <select value={item.category} onChange={(event) => void patch(item.id, { category: event.target.value })} aria-label={`Category for ${item.title}`}
                              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 focus:border-blue-500 focus:outline-none">
                              {CATEGORIES.map((entry) => <option key={entry.key} value={entry.key}>{entry.emoji} {entry.label}</option>)}
                            </select>
                            <span className="sr-only">{cat.label}</span>
                          </td>
                          <td className="px-2 py-2">
                            <button onClick={() => onOpen(item)} className="w-full text-left" title="Open to edit platforms and format">
                              <span className="block truncate text-xs text-zinc-300">{item.platforms.slice(0, 3).map(platformEmoji).join(" ")} {formatLabel(item)}</span>
                              {item.platforms.length > 0 && <span className="block truncate text-[10px] text-zinc-600 mt-0.5">{item.platforms.map(platformLabel).join(", ")}</span>}
                            </button>
                          </td>
                          <td className="px-2 py-2">
                            <select value={item.status} onChange={(event) => void patch(item.id, { status: event.target.value })} aria-label={`Status for ${item.title}`}
                              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 focus:border-blue-500 focus:outline-none">
                              {CONTENT_STATUSES.map((entry) => <option key={entry.key} value={entry.key}>{entry.emoji} {entry.label}</option>)}
                            </select>
                            <span className="sr-only">{itemStatus.label}</span>
                          </td>
                          <td className="px-2 py-2"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold whitespace-nowrap ${ready.className}`}>{ready.label}</span></td>
                          <td className="px-2 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => onOpen(item)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-zinc-500 hover:bg-zinc-800 hover:text-white">Edit →</button>
                              <button onClick={() => { setDeleteError(false); setConfirmItem(item); }}
                                aria-label={`Delete ${item.title}`} title="Delete"
                                className="rounded-lg px-2 py-1.5 text-xs text-zinc-600 hover:bg-rose-500/10 hover:text-rose-400">🗑</button>
                            </div>
                            {savingId === item.id && <span className="block text-[9px] text-blue-400 mt-0.5">Saving…</span>}
                            {saveErrorId === item.id && <span className="block text-[9px] text-rose-400 mt-0.5">Save failed</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {confirmItem && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-content-title">
          <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Cancel deletion"
            onClick={() => { if (!deletingId) setConfirmItem(null); }} />
          <div className="relative w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10 text-lg">🗑</div>
            <h2 id="delete-content-title" className="text-lg font-bold text-white">Delete this content?</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Are you sure you want to delete <span className="font-semibold text-zinc-200">“{confirmItem.title}”</span>? This cannot be undone.
            </p>
            {deleteError && <p className="mt-3 text-sm text-rose-400">Couldn&apos;t delete it. Please try again.</p>}
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirmItem(null)} disabled={Boolean(deletingId)}
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50">Cancel</button>
              <button onClick={() => void confirmDelete()} disabled={Boolean(deletingId)}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-60">
                {deletingId ? "Deleting…" : "Yes, delete it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
