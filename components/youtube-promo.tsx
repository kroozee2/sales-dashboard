"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CONFIDENT } from "@/lib/youtube-link";

// Tying a posted Create entry to the upload it became, and the three things
// that go out once it has.
//
// The suggestion is never saved on its own. A wrong link writes a wrong URL
// into a Skool post, an email and a DM at once, so a person confirms it and
// the reasons for the guess are shown next to the button.

export interface PromoBundle {
  skool: string;
  email: { subject: string; body: string };
  dm: string;
  generated_at?: string;
}

interface Candidate {
  video: { videoId: string; title: string; url: string; postedAt: string | null; views: number | null };
  score: number;
  reasons: string[];
  sameDay: boolean;
}

interface Suggestion {
  item: { id: string; title: string };
  best: Candidate | null;
  others: Candidate[];
  confident: boolean;
}

interface LinkedEntry {
  item: { id: string; title: string };
  link: { video_id: string; url: string; posted_title: string; posted_at: string | null };
  promo: PromoBundle | null;
  hasPromo: boolean;
}

export interface LinkPayload {
  linked: LinkedEntry[];
  suggestions: Suggestion[];
}

export function useYouTubeLinks() {
  const [data, setData] = useState<LinkPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/youtube/link", { cache: "no-store" });
      const json = (await res.json()) as LinkPayload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load the video links");
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the video links");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return { data, loading, error, reload: load };
}

export function YouTubeLinkPanel({ data, loading, error, onChanged }: {
  data: LinkPayload | null;
  loading: boolean;
  error: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const pending = useMemo(
    () => (data?.suggestions ?? []).filter((s) => s.best !== null),
    [data],
  );

  const confirm = async (itemId: string, videoId: string, how: "suggested" | "manual") => {
    setBusy(itemId); setFailed(null);
    try {
      const res = await fetch("/api/youtube/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, videoId, how, withPromo: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not link that video");
      if (json.promoError) setFailed(`Linked, but the promo did not write: ${json.promoError}`);
      onChanged();
    } catch (err) {
      setFailed(err instanceof Error ? err.message : "Could not link that video");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <p className="text-xs text-zinc-500">Checking which posts are already live…</p>;
  if (error) return <p role="alert" className="text-xs text-rose-300">{error}</p>;
  if (pending.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-5">
      <h2 className="text-sm font-black text-amber-100">
        {pending.length} posted {pending.length === 1 ? "video needs" : "videos need"} linking to the upload
      </h2>
      <p className="mt-1 text-xs text-amber-100/60">
        The published title is rarely the working title, so these are matched on the date they went
        out. Confirm each one and the Skool post, email and DM get written from the real title.
      </p>

      {failed && <p role="alert" className="mt-3 text-xs font-bold text-rose-300">{failed}</p>}

      <ul className="mt-4 space-y-3">
        {pending.map((suggestion) => {
          const best = suggestion.best!;
          return (
            <li key={suggestion.item.id} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">In Create</p>
              <p className="text-sm font-bold text-white">{suggestion.item.title}</p>

              <p className="mt-3 text-[10px] font-black uppercase tracking-wider text-zinc-600">Went live as</p>
              <p className="text-sm font-bold text-red-200">{best.video.title}</p>
              <p className="mt-0.5 truncate text-[11px] text-zinc-500">{best.video.url}</p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${
                  best.score >= CONFIDENT
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-200"
                }`}>
                  {best.score >= CONFIDENT ? "Confident" : "Check this one"}
                </span>
                <span className="text-[11px] text-zinc-500">{best.reasons.join(" · ")}</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void confirm(suggestion.item.id, best.video.videoId, "suggested")}
                  disabled={busy === suggestion.item.id}
                  className="rounded-xl bg-gradient-to-r from-red-600 to-red-500 px-4 py-2 text-xs font-black text-white disabled:opacity-40"
                >
                  {busy === suggestion.item.id ? "Linking and writing…" : "✓ That's the one"}
                </button>
                {suggestion.others.slice(0, 2).map((other) => (
                  <button
                    key={other.video.videoId}
                    type="button"
                    onClick={() => void confirm(suggestion.item.id, other.video.videoId, "manual")}
                    disabled={busy === suggestion.item.id}
                    title={other.reasons.join(" · ")}
                    className="max-w-[16rem] truncate rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300 hover:border-zinc-500 disabled:opacity-40"
                  >
                    {other.video.title}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The three pieces, for one video, with the copy buttons that actually get used. */
export function PromoPieces({ promo, url }: { promo: PromoBundle; url: string }) {
  const [tab, setTab] = useState<"skool" | "email" | "dm">("skool");
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch { setCopied("failed"); }
  };

  const body = tab === "skool" ? promo.skool
    : tab === "dm" ? promo.dm
      : `Subject: ${promo.email.subject}\n\n${promo.email.body}`;

  return (
    <div className="rounded-xl border border-zinc-800 bg-black/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {([["skool", "🏫 Skool post"], ["email", "✉️ Email"], ["dm", "💬 DM"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
              tab === key
                ? "border-red-500/50 bg-red-500/15 text-red-200"
                : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void copy(tab, body)}
          className="ml-auto rounded-lg bg-zinc-800 px-3 py-1.5 text-[11px] font-bold text-zinc-200 hover:bg-zinc-700"
        >
          {copied === tab ? "✓ Copied" : copied === "failed" ? "Copy failed" : "📋 Copy"}
        </button>
      </div>

      {tab === "email" && (
        <p className="mt-3 text-[11px] text-zinc-500">
          <span className="font-black uppercase tracking-wider text-zinc-600">Subject </span>
          <span className="text-zinc-300">{promo.email.subject}</span>
        </p>
      )}

      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-200">
        {tab === "email" ? promo.email.body : body}
      </pre>

      <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-block truncate text-[11px] text-red-300 hover:text-red-200">
        {url} ↗
      </a>
    </div>
  );
}
