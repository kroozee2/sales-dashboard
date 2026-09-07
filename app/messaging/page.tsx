"use client";

import { useEffect, useMemo, useState } from "react";
import type { MessagingDocument } from "@/lib/messaging";

type ApiResponse = { document?: MessagingDocument; error?: string };
type MessagingDraft = Pick<MessagingDocument, "title" | "subtitle" | "sections"> & { base_revision: string };

const MESSAGING_DRAFT_KEY = "salesos:messaging-draft:v1";
const MAX_DRAFT_BYTES = 180_000;

function restoreDraft(raw: string | null, server: MessagingDocument): MessagingDocument | null {
  if (!raw || raw.length > MAX_DRAFT_BYTES) return null;
  try {
    const draft = JSON.parse(raw) as Partial<MessagingDraft>;
    if (draft.base_revision !== server.revision) return null;
    if (typeof draft.title !== "string" || typeof draft.subtitle !== "string" || !Array.isArray(draft.sections)) return null;
    if (draft.sections.length !== server.sections.length) return null;
    const sections = draft.sections.map((section, index) => {
      const expected = server.sections[index];
      if (!section || section.id !== expected.id || section.title !== expected.title || typeof section.content !== "string") {
        throw new Error("Invalid local messaging draft");
      }
      return { id: expected.id, title: expected.title, content: section.content };
    });
    return { ...server, title: draft.title, subtitle: draft.subtitle, sections };
  } catch {
    return null;
  }
}

function sectionHeight(content: string): number {
  const lines = content.split("\n").length;
  return Math.min(900, Math.max(220, lines * 27));
}

export default function MessagingPage() {
  const [document, setDocument] = useState<MessagingDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/messaging", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as ApiResponse;
        if (!response.ok || !data.document) throw new Error(data.error || "Could not load messaging");
        let restored: MessagingDocument | null = null;
        try {
          restored = restoreDraft(window.sessionStorage.getItem(MESSAGING_DRAFT_KEY), data.document);
        } catch {
          // Storage can be unavailable in hardened browser contexts; the server copy still loads.
        }
        setDocument(restored ?? data.document);
        if (restored) {
          setDirty(true);
          setMessage("Recovered unsaved changes");
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessage(error instanceof Error ? error.message : "Could not load messaging");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!dirty || !document) return;
    const draft: MessagingDraft = {
      base_revision: document.revision,
      title: document.title,
      subtitle: document.subtitle,
      sections: document.sections,
    };
    try {
      window.sessionStorage.setItem(MESSAGING_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Navigation confirmation still protects edits when local storage is unavailable.
    }
  }, [dirty, document]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    const guardLink = (event: MouseEvent) => {
      if (!dirty || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a");
      if (!anchor || anchor.target === "_blank") return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href || href.startsWith("#")) return;
      if (!window.confirm("You have unsaved messaging changes. Leave without saving?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    window.document.addEventListener("click", guardLink, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.document.removeEventListener("click", guardLink, true);
    };
  }, [dirty]);

  const visibleSections = useMemo(() => {
    if (!document) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return document.sections;
    return document.sections.filter((section) =>
      `${section.title}\n${section.content}`.toLowerCase().includes(needle),
    );
  }, [document, query]);

  const changeTitle = (field: "title" | "subtitle", value: string) => {
    setDocument((current) => current ? { ...current, [field]: value } : current);
    setDirty(true);
    setMessage("");
  };

  const changeSection = (id: string, content: string) => {
    setDocument((current) => current ? {
      ...current,
      sections: current.sections.map((section) => section.id === id ? { ...section, content } : section),
    } : current);
    setDirty(true);
    setMessage("");
  };

  const save = async () => {
    if (!document || saving || !dirty) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/messaging", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected_revision: document.revision,
          title: document.title,
          subtitle: document.subtitle,
          sections: document.sections,
        }),
      });
      const data = await response.json() as ApiResponse;
      if (!response.ok || !data.document) throw new Error(data.error || "Could not save messaging");
      setDocument(data.document);
      setDirty(false);
      setMessage("Saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save messaging");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center gap-3 text-zinc-400">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-400" />
        Loading Messaging…
      </div>
    );
  }

  if (!document) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-red-900/60 bg-red-950/30 p-6">
        <h1 className="text-xl font-bold text-white">Messaging could not load</h1>
        <p className="mt-2 text-sm text-red-300">{message || "The messaging source is unavailable."}</p>
        <button onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white hover:bg-zinc-700">Reload</button>
      </div>
    );
  }

  const savedAt = new Date(document.updated_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="sticky top-14 z-30 -mx-4 mb-7 border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur lg:top-0 sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">🧠</span>
              <span className="font-semibold text-white">Messaging</span>
              {dirty && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">Unsaved</span>}
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">One source of truth. Last saved {savedAt}.</p>
          </div>
          {message && (
            <span className={message === "Saved" ? "text-sm font-medium text-emerald-400" : message === "Recovered unsaved changes" ? "max-w-sm text-sm text-amber-300" : "max-w-sm text-sm text-red-400"}>
              {message === "Saved" ? "✓ Saved" : message}
            </span>
          )}
          <button
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <header className="mb-8 overflow-hidden rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-blue-950/40 p-6 shadow-2xl shadow-black/20 sm:p-9">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-blue-400">7-Figure CEO Start</p>
        <input
          aria-label="Messaging bible title"
          disabled={saving}
          value={document.title}
          onChange={(event) => changeTitle("title", event.target.value)}
          className="w-full border-0 bg-transparent p-0 text-3xl font-black tracking-tight text-white outline-none placeholder:text-zinc-600 sm:text-5xl"
        />
        <input
          aria-label="Messaging bible subtitle"
          disabled={saving}
          value={document.subtitle}
          onChange={(event) => changeTitle("subtitle", event.target.value)}
          className="mt-3 w-full border-0 bg-transparent p-0 text-lg font-medium text-blue-200 outline-none placeholder:text-zinc-600 sm:text-2xl"
        />
        <p className="mt-6 max-w-3xl text-sm leading-6 text-zinc-400">
          Edit the strategy directly below. Every section saves together so this page remains the canonical messaging foundation for offers, content, sales pages, and campaigns.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <label htmlFor="messaging-search" className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Search</label>
            <input
              id="messaging-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a belief or objection…"
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-500"
            />
            <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Jump to section</p>
            <nav className="max-h-[58vh] space-y-1 overflow-y-auto pr-1">
              {visibleSections.map((section) => (
                <a key={section.id} href={`#${section.id}`} className="block rounded-lg px-2 py-2 text-xs leading-4 text-zinc-400 transition hover:bg-zinc-800 hover:text-white">
                  {section.title}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <main className="space-y-5">
          {visibleSections.map((section, index) => (
            <section id={section.id} key={section.id} className="scroll-mt-28 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 shadow-lg shadow-black/10">
              <div className="flex items-center gap-3 border-b border-zinc-800 px-5 py-4 sm:px-6">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-xs font-bold text-blue-300">{index + 1}</span>
                <h2 className="text-lg font-bold text-white sm:text-xl">{section.title}</h2>
              </div>
              <div className="p-3 sm:p-4">
                <textarea
                  aria-label={`${section.title} content`}
                  disabled={saving}
                  value={section.content}
                  onChange={(event) => changeSection(section.id, event.target.value)}
                  style={{ height: sectionHeight(section.content) }}
                  className="w-full resize-y rounded-xl border border-transparent bg-zinc-950/50 px-4 py-4 font-sans text-[15px] leading-7 text-zinc-200 outline-none transition placeholder:text-zinc-600 hover:border-zinc-700 focus:border-blue-500 focus:bg-zinc-950"
                  spellCheck
                />
              </div>
            </section>
          ))}

          {visibleSections.length === 0 && (
            <div className="rounded-2xl border border-dashed border-zinc-700 p-10 text-center text-zinc-500">No messaging sections match “{query}”.</div>
          )}
        </main>
      </div>
    </div>
  );
}
