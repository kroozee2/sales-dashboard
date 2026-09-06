"use client";

import { useMemo, useState } from "react";
import {
  OFFER_PAGE_ASSETS,
  OFFER_PAGE_CATEGORIES,
  filterOfferPageAssets,
  type OfferPageCategory,
} from "@/lib/offer-page-assets";

const CATEGORY_STYLE: Record<OfferPageCategory, string> = {
  funnel: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  "lead-magnet": "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  "client-asset": "border-violet-500/30 bg-violet-500/10 text-violet-300",
  "member-asset": "border-amber-500/30 bg-amber-500/10 text-amber-300",
  "event-asset": "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

export default function OfferPagesLibrary() {
  const [category, setCategory] = useState<OfferPageCategory | "all">("all");
  const [query, setQuery] = useState("");
  const shown = useMemo(
    () => filterOfferPageAssets(OFFER_PAGE_ASSETS, category, query),
    [category, query],
  );

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-950/80 via-zinc-900 to-zinc-950 p-6 md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative max-w-3xl">
          <div className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-violet-300">7-Figure CEO Page Vault</div>
          <h2 className="text-3xl font-black tracking-tight text-white md:text-5xl">Every page we built. One command center.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-300 md:text-base">
            Open the right funnel, lead magnet, member experience, or client asset without hunting through Vercel. This is the live portfolio of pages powering the business.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-zinc-300">
            <span className="rounded-full border border-zinc-700 bg-zinc-950/60 px-3 py-1.5"><strong className="text-white">{OFFER_PAGE_ASSETS.length}</strong> live pages</span>
            <span className="rounded-full border border-zinc-700 bg-zinc-950/60 px-3 py-1.5"><strong className="text-white">{OFFER_PAGE_CATEGORIES.length - 1}</strong> categories</span>
            <span className="rounded-full border border-zinc-700 bg-zinc-950/60 px-3 py-1.5">↗ Opens in a new tab</span>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {OFFER_PAGE_CATEGORIES.map((item) => {
              const active = category === item.id;
              const count = item.id === "all"
                ? OFFER_PAGE_ASSETS.length
                : OFFER_PAGE_ASSETS.filter((asset) => asset.category === item.id).length;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(item.id)}
                  title={item.description}
                  className={`whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold transition ${active ? "border-violet-500 bg-violet-600 text-white" : "border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-white"}`}
                >
                  {item.emoji} {item.label} <span className={active ? "text-violet-200" : "text-zinc-600"}>{count}</span>
                </button>
              );
            })}
          </div>
          <label className="relative block w-full lg:w-80">
            <span className="pointer-events-none absolute left-3 top-2.5 text-zinc-500">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pages, people, or purpose…"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-500"
            />
          </label>
        </div>
      </section>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 py-16 text-center text-sm text-zinc-500">No pages match that search.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((asset) => {
            const categoryMeta = OFFER_PAGE_CATEGORIES.find((item) => item.id === asset.category)!;
            return (
              <article key={asset.id} className={`group relative flex min-h-72 flex-col overflow-hidden rounded-2xl border bg-zinc-900 p-5 transition hover:-translate-y-0.5 hover:border-violet-500/50 hover:shadow-2xl hover:shadow-violet-950/30 ${asset.featured ? "border-violet-500/30" : "border-zinc-800"}`}>
                {asset.featured && <div className="absolute right-0 top-0 rounded-bl-xl bg-violet-500/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-violet-300">Featured</div>}
                <div className={`mb-4 w-fit rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${CATEGORY_STYLE[asset.category]}`}>
                  {categoryMeta.emoji} {categoryMeta.label}
                </div>
                <h3 className="pr-12 text-xl font-bold text-white">{asset.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{asset.purpose}</p>
                <div className="mt-4 border-l-2 border-zinc-700 pl-3 text-xs leading-relaxed text-zinc-500">
                  <span className="font-bold uppercase tracking-wide text-zinc-400">For: </span>{asset.audience}
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {asset.tags.map((tag) => <span key={tag} className="rounded-md bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400">{tag}</span>)}
                </div>
                <div className="mt-auto pt-5">
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-black text-zinc-950 transition hover:bg-violet-200"
                  >
                    Open live page <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
