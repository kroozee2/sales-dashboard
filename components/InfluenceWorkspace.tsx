'use client';

import { useMemo, useState } from 'react';
import {
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Clipboard,
  Gem,
  HeartPulse,
  Lightbulb,
  MousePointerClick,
  MoveRight,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Waves,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  ETHICAL_INFLUENCE_GUARDRAILS,
  INFLUENCE_BUILDER_FIELDS,
  INFLUENCE_CATEGORIES,
  buildInfluenceBrief,
  filterInfluenceTactics,
  type InfluenceBuilderFieldId,
  type InfluenceBuilderValues,
  type InfluenceCategory,
  type InfluenceCategoryId,
} from '@/lib/influence-strategies';

const ICONS: Record<string, LucideIcon> = {
  BadgeCheck,
  CircleDashed,
  Gem,
  HeartPulse,
  MousePointerClick,
  MoveRight,
  RefreshCw,
  Waves,
};

const ACCENTS: Record<InfluenceCategory['accent'], { text: string; border: string; bg: string; dot: string }> = {
  violet: { text: 'text-violet-300', border: 'border-violet-400', bg: 'bg-violet-400/[0.08]', dot: 'bg-violet-400' },
  sky: { text: 'text-sky-300', border: 'border-sky-400', bg: 'bg-sky-400/[0.08]', dot: 'bg-sky-400' },
  emerald: { text: 'text-emerald-300', border: 'border-emerald-400', bg: 'bg-emerald-400/[0.08]', dot: 'bg-emerald-400' },
  amber: { text: 'text-amber-300', border: 'border-amber-400', bg: 'bg-amber-400/[0.08]', dot: 'bg-amber-400' },
  rose: { text: 'text-rose-300', border: 'border-rose-400', bg: 'bg-rose-400/[0.08]', dot: 'bg-rose-400' },
  indigo: { text: 'text-indigo-300', border: 'border-indigo-400', bg: 'bg-indigo-400/[0.08]', dot: 'bg-indigo-400' },
  cyan: { text: 'text-cyan-300', border: 'border-cyan-400', bg: 'bg-cyan-400/[0.08]', dot: 'bg-cyan-400' },
  lime: { text: 'text-lime-300', border: 'border-lime-400', bg: 'bg-lime-400/[0.08]', dot: 'bg-lime-400' },
};

const TOTAL_TACTICS = INFLUENCE_CATEGORIES.reduce((sum, category) => sum + category.tactics.length, 0);

async function writeClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
  await navigator.clipboard.writeText(text);
}

export default function InfluenceWorkspace() {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<InfluenceCategoryId | 'all'>('all');
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderValues, setBuilderValues] = useState<InfluenceBuilderValues>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [failedCopyId, setFailedCopyId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const results = useMemo(
    () => filterInfluenceTactics(INFLUENCE_CATEGORIES, categoryId, query),
    [categoryId, query],
  );
  const brief = useMemo(() => buildInfluenceBrief(builderValues), [builderValues]);
  const resultsLabel = `${results.length} ${results.length === 1 ? 'tactic' : 'tactics'} shown`;

  function selectCategory(next: InfluenceCategoryId | 'all') {
    setCategoryId(next);
    setAnnouncement(null);
  }

  function updateBuilder(id: InfluenceBuilderFieldId, value: string) {
    setBuilderValues((current) => ({ ...current, [id]: value }));
    setAnnouncement(null);
  }

  async function copyExample(id: string, title: string, example: string) {
    setFailedCopyId(null);
    try {
      await writeClipboard(example);
      setCopiedId(id);
      setAnnouncement(`Example copied: ${title}.`);
      window.setTimeout(() => {
        setCopiedId((current) => current === id ? null : current);
        setAnnouncement((current) => current === `Example copied: ${title}.` ? null : current);
      }, 1800);
    } catch {
      setCopiedId(null);
      setFailedCopyId(id);
      setAnnouncement('Copy failed. Select the example and copy it manually.');
    }
  }

  async function copyBrief() {
    if (!brief) return;
    setFailedCopyId(null);
    try {
      await writeClipboard(brief);
      setCopiedId('brief');
      setAnnouncement('Influence brief copied.');
      window.setTimeout(() => {
        setCopiedId((current) => current === 'brief' ? null : current);
        setAnnouncement((current) => current === 'Influence brief copied.' ? null : current);
      }, 1800);
    } catch {
      setCopiedId(null);
      setFailedCopyId('brief');
      setAnnouncement('Copy failed. Select the brief and copy it manually.');
    }
  }

  return (
    <section aria-labelledby="influence-title" className="mx-auto max-w-[1500px] space-y-6 overflow-x-hidden">
      <header className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0f1012] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-7">
        <div aria-hidden="true" className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-500/[0.08] blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-violet-300">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
              Ethical influence system
            </div>
            <h2 id="influence-title" className="text-2xl font-semibold tracking-[-0.03em] text-zinc-50 sm:text-3xl">
              Influence playbook
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">
              Create the right state, earn attention, build belief, and make the next action clear. Designed for content, calls, workshops, and offers.
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 lg:w-auto">
            <div className="rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 py-3">
              <div className="text-xl font-semibold tracking-tight text-zinc-100">{INFLUENCE_CATEGORIES.length}</div>
              <div className="text-xs text-zinc-400">categories</div>
            </div>
            <div className="rounded-xl border border-violet-400/25 bg-violet-400/[0.07] px-4 py-3">
              <div className="text-xl font-semibold tracking-tight text-violet-200">{TOTAL_TACTICS} tactics</div>
              <div className="text-xs text-zinc-400">ready to use</div>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {INFLUENCE_CATEGORIES.map((category) => {
          const Icon = ICONS[category.icon] ?? Lightbulb;
          const accent = ACCENTS[category.accent];
          const selected = categoryId === category.id;
          return (
            <button
              key={category.id}
              type="button"
              aria-label={`${category.title}, ${category.tactics.length} tactics`}
              aria-pressed={selected}
              onClick={() => selectCategory(selected ? 'all' : category.id)}
              className={`min-h-24 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                selected
                  ? `${accent.border} ${accent.bg} ring-1 ring-inset ring-white/10`
                  : 'border-zinc-500 bg-white/[0.025] hover:border-zinc-400 hover:bg-white/[0.045]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg border ${accent.border} ${accent.bg} ${accent.text}`}>
                  <Icon aria-hidden="true" className="h-4 w-4" />
                </span>
                <span className="text-xs tabular-nums text-zinc-400">{category.tactics.length}</span>
              </div>
              <div className="mt-3 text-sm font-semibold text-zinc-100">{category.title}</div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">{category.purpose}</p>
            </button>
          );
        })}
      </div>

      <section aria-labelledby="guardrails-title" className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-emerald-300" />
          <h3 id="guardrails-title" className="text-sm font-semibold text-zinc-100">The ethical line</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {ETHICAL_INFLUENCE_GUARDRAILS.map((item) => (
            <div key={item.title} className="rounded-xl border border-white/[0.07] bg-[#0d0e10] p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                <Check aria-hidden="true" className="h-3.5 w-3.5 text-emerald-300" />
                {item.title}
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-400">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="builder-title" className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.035]">
        <button
          type="button"
          aria-expanded={builderOpen}
          aria-controls="influence-quick-builder"
          aria-label={builderOpen ? 'Close Quick Builder' : 'Open Quick Builder'}
          onClick={() => setBuilderOpen((current) => !current)}
          className="flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl px-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 sm:px-5"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-violet-400/30 bg-violet-400/[0.08] text-violet-200">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span id="builder-title" className="block text-sm font-semibold text-zinc-100">Quick Builder</span>
              <span className="block truncate text-xs text-zinc-400">Turn a situation into a clear influence brief.</span>
            </span>
          </span>
          {builderOpen ? <ChevronUp aria-hidden="true" className="h-4 w-4 flex-none text-zinc-400" /> : <ChevronDown aria-hidden="true" className="h-4 w-4 flex-none text-zinc-400" />}
        </button>

        {builderOpen && (
          <div id="influence-quick-builder" className="border-t border-white/[0.08] p-4 sm:p-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
              <div className="grid gap-4 sm:grid-cols-2">
                {INFLUENCE_BUILDER_FIELDS.map((field) => (
                  <label key={field.id} className="block min-w-0">
                    <span className="mb-1.5 block text-xs font-medium text-zinc-300">{field.label}</span>
                    <textarea
                      value={builderValues[field.id] ?? ''}
                      onChange={(event) => updateBuilder(field.id, event.target.value)}
                      placeholder={field.placeholder}
                      rows={3}
                      className="min-h-24 w-full resize-y rounded-lg border border-zinc-500 bg-[#0b0c0e] px-3 py-2.5 text-base leading-6 text-zinc-100 outline-none placeholder:text-zinc-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 sm:text-sm"
                    />
                  </label>
                ))}
              </div>

              <div className="xl:sticky xl:top-24 xl:self-start">
                <div className="rounded-xl border border-white/[0.1] bg-[#0b0c0e] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-zinc-100">Influence brief</h4>
                    <button
                      type="button"
                      aria-label={failedCopyId === 'brief' ? 'Copy failed, retry influence brief' : 'Copy influence brief'}
                      disabled={!brief}
                      onClick={() => void copyBrief()}
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-500 bg-white/[0.04] px-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    >
                      {copiedId === 'brief' ? <Check aria-hidden="true" className="h-4 w-4 text-emerald-300" /> : failedCopyId === 'brief' ? <X aria-hidden="true" className="h-4 w-4 text-rose-300" /> : <Clipboard aria-hidden="true" className="h-4 w-4" />}
                      {copiedId === 'brief' ? 'Copied' : failedCopyId === 'brief' ? 'Copy failed, retry' : 'Copy'}
                    </button>
                  </div>
                  <div
                    aria-label="Influence brief preview"
                    tabIndex={0}
                    className="mt-3 min-h-56 whitespace-pre-wrap break-words rounded-lg border border-white/[0.08] bg-white/[0.025] p-3 text-sm leading-6 text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  >
                    {brief || 'Fill in any field. Only what you enter will appear here.'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="library-title" className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 id="library-title" className="text-lg font-semibold tracking-tight text-zinc-100">Tactic library</h3>
            <p className="mt-1 text-sm text-zinc-400">Search the explanation or copy a tailored example.</p>
          </div>
          <div className="relative w-full md:max-w-md">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              aria-label="Search influence tactics"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setAnnouncement(null);
              }}
              placeholder="Search state, proof, loops, action…"
              className="min-h-11 w-full rounded-lg border border-zinc-500 bg-[#0b0c0e] pl-10 pr-10 text-base text-zinc-100 outline-none placeholder:text-zinc-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 sm:text-sm"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear influence search"
                onClick={() => setQuery('')}
                className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-r-lg text-zinc-400 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1" aria-label="Filter influence tactics by category">
          <button
            type="button"
            aria-pressed={categoryId === 'all'}
            onClick={() => selectCategory('all')}
            className={`min-h-11 flex-none rounded-lg border px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${categoryId === 'all' ? 'border-violet-400/50 bg-violet-400/[0.12] text-violet-100 shadow-[inset_0_-2px_0_rgb(167_139_250)]' : 'border-zinc-500 bg-white/[0.02] text-zinc-400 hover:text-zinc-200'}`}
          >
            All {TOTAL_TACTICS}
          </button>
          {INFLUENCE_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={categoryId === category.id}
              onClick={() => selectCategory(category.id)}
              className={`min-h-11 flex-none whitespace-nowrap rounded-lg border px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${categoryId === category.id ? 'border-violet-400/50 bg-violet-400/[0.12] text-violet-100 shadow-[inset_0_-2px_0_rgb(167_139_250)]' : 'border-zinc-500 bg-white/[0.02] text-zinc-400 hover:text-zinc-200'}`}
            >
              {category.title} {category.tactics.length}
            </button>
          ))}
        </div>

        <div role="status" aria-live="polite" aria-atomic="true" className="min-h-5 text-xs text-zinc-400">
          {announcement ?? resultsLabel}
        </div>

        {results.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-500 bg-white/[0.015] px-5 py-14 text-center">
            <Search aria-hidden="true" className="mx-auto h-6 w-6 text-zinc-400" />
            <p className="mt-3 text-sm font-medium text-zinc-300">No tactics match that search.</p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCategoryId('all');
              }}
              className="mt-3 min-h-11 rounded-lg px-4 text-sm text-violet-300 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {results.map((tactic) => {
              const accent = ACCENTS[tactic.categoryAccent];
              const Icon = ICONS[tactic.categoryIcon] ?? Lightbulb;
              return (
                <article key={tactic.id} className="flex min-w-0 flex-col rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 transition-colors hover:border-white/[0.15] hover:bg-white/[0.04]">
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg border ${accent.border} ${accent.bg} ${accent.text}`}>
                      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h4 className="break-words text-sm font-semibold text-zinc-100">{tactic.title}</h4>
                        <span className={`text-[10px] font-medium ${accent.text}`}>{tactic.categoryTitle}</span>
                      </div>
                      <p className="mt-1.5 break-words text-xs leading-5 text-zinc-400">{tactic.explanation}</p>
                    </div>
                  </div>
                  <blockquote className="mt-4 flex-1 break-words rounded-lg border border-white/[0.07] bg-[#0b0c0e] p-3 text-sm leading-6 text-zinc-300">
                    “{tactic.example}”
                  </blockquote>
                  <button
                    type="button"
                    aria-label={failedCopyId === tactic.id ? `Copy failed for ${tactic.title}. Retry` : `Copy example: ${tactic.title}`}
                    onClick={() => void copyExample(tactic.id, tactic.title, tactic.example)}
                    className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg px-3 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  >
                    {copiedId === tactic.id ? <Check aria-hidden="true" className="h-4 w-4 text-emerald-300" /> : failedCopyId === tactic.id ? <X aria-hidden="true" className="h-4 w-4 text-rose-300" /> : <Clipboard aria-hidden="true" className="h-4 w-4" />}
                    {copiedId === tactic.id ? 'Copied' : failedCopyId === tactic.id ? 'Copy failed, retry' : 'Copy example'}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
