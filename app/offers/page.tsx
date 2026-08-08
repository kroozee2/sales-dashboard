'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Offer = {
  id: string;
  airtable_id: string | null;
  name: string | null;
  offer_type: string | null;
  selling: string | null;
  status: string | null;
  length: string | null;
  pif_price: number | null;
  pp_down: number | null;
  pp_price: number | null;
  spots_available: number | null;
  start_date: string | null;
  pif_link: string | null;
  pp_link: string | null;
  payment_link: string | null;
  sales_page: string | null;
  purchase_page: string | null;
  offer_1_sheeter: string | null;
  onboarding_link: string | null;
  revenue: number | null;
  num_sales: number | null;
  target_revenue: number | null;
  enrollment_target: number | null;
  who_its_for: string | null;
  promise: string | null;
  pain_points: string | null;
  avatar: string | null;
  pain: string | null;
  fear: string | null;
  desire: string | null;
  hooks: string | null;
  objections: string | null;
  dm_copy: string | null;
  ad_copy: string | null;
  launch_post: string | null;
  setting_scripts: SettingScripts | null;
  synced_at: string | null;
  created_at: string | null;
};

type SettingScripts = {
  opener?: string;
  permission_ask?: string;
  no_brainer_pitch?: string;
  make_no_a_yes?: string;
  objection_price?: string;
  objection_time?: string;
  objection_think?: string;
  followup_ghost?: string;
};

const SCRIPT_LABELS: { key: keyof SettingScripts; emoji: string; label: string; desc: string }[] = [
  { key: 'opener',           emoji: '👋', label: 'Opener',              desc: 'First DM — spark curiosity, no pitch' },
  { key: 'permission_ask',   emoji: '🙏', label: 'Ask Permission',      desc: 'Step 1 of the 3-step transition' },
  { key: 'no_brainer_pitch', emoji: '🎁', label: 'No-Brainer Pitch',    desc: 'Step 2 — value-first call invite' },
  { key: 'make_no_a_yes',    emoji: '✅', label: 'Make the NO a YES',   desc: 'Step 3 — the disqualifier close' },
  { key: 'objection_price',  emoji: '💰', label: 'Price Objection',     desc: '"It\'s too expensive"' },
  { key: 'objection_time',   emoji: '⏰', label: 'Timing Objection',    desc: '"Not right now / too busy"' },
  { key: 'objection_think',  emoji: '🤔', label: 'Think About It',      desc: '"I need to think it over"' },
  { key: 'followup_ghost',   emoji: '👻', label: 'Ghost Revival',       desc: 'They went quiet after interest' },
];

type GeneratedOffer = {
  name: string;
  offer_type: string;
  pif_price: number;
  pp_down: number;
  pp_price: number;
  who_its_for: string;
  promise: string;
  pain_points: string[];
  dm_copy: string;
  ad_copy: string;
  links_needed: string[];
  recommended_price_reasoning: string;
  airtable_id?: string;
  error?: string;
};

type MessagingSection = 'avatar' | 'pain' | 'fear' | 'desire' | 'promise' | 'hooks' | 'objections' | 'dm_copy' | 'ad_copy' | 'launch_post';

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  '🎖️ High Ticket Offer':   { color: 'text-violet-300', bg: 'bg-violet-500/10', border: 'border-violet-500/30' },
  '🧲 Low Ticket Offer':    { color: 'text-sky-300',    bg: 'bg-sky-500/10',    border: 'border-sky-500/30' },
  '🖥️ Course Offer':        { color: 'text-amber-300',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30' },
  '👨‍👨‍👦‍👦 Event - In Person':  { color: 'text-pink-300',   bg: 'bg-pink-500/10',   border: 'border-pink-500/30' },
  '💻 Event - Online':      { color: 'text-emerald-300',bg: 'bg-emerald-500/10',border: 'border-emerald-500/30' },
  '💪 Done For You':        { color: 'text-orange-300', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  '⭐️ Sponsorship':         { color: 'text-yellow-300', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
};

const MESSAGING_SECTIONS: { key: MessagingSection; emoji: string; label: string; desc: string }[] = [
  { key: 'avatar',      emoji: '🧍',  label: 'The Person',    desc: 'Day-in-diary avatar (Ovens)' },
  { key: 'pain',        emoji: '🔥',  label: 'The Problem',   desc: 'Core pain & false beliefs (Brunson)' },
  { key: 'fear',        emoji: '😰',  label: 'The Fears',     desc: 'What keeps them stuck' },
  { key: 'desire',      emoji: '✨',  label: 'The Desires',   desc: 'Dream outcome (Hormozi)' },
  { key: 'promise',     emoji: '🏆',  label: 'The Promise',   desc: 'Core transformation statement' },
  { key: 'hooks',       emoji: '🎣',  label: 'Hook Angles',   desc: '4 belief-shattering hooks' },
  { key: 'objections',  emoji: '🛡️',  label: 'Objections',    desc: 'Top 5 with reframes' },
  { key: 'dm_copy',     emoji: '💬',  label: 'DM Copy',       desc: 'Ready-to-send warm outreach' },
  { key: 'ad_copy',     emoji: '📣',  label: 'Ad Copy',       desc: 'Facebook/Instagram ad' },
  { key: 'launch_post', emoji: '🚀',  label: 'Launch Post',   desc: 'Full social media launch post' },
];

function fmt$(n: number | null | undefined): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function typeLabel(t: string | null): string {
  if (!t) return 'Offer';
  return t.replace(/^[\p{Emoji}️⃣]+\s*/u, '').replace(' Offer', '').trim();
}

function hasMessaging(offer: Offer): boolean {
  return !!(offer.avatar || offer.pain || offer.fear || offer.desire || offer.dm_copy);
}

// ─── Offer Card ───────────────────────────────────────────────────────────────

function OfferCard({ offer, onSelect, onDeactivate, onDelete }: {
  offer: Offer;
  onSelect: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) {
  const cfg = TYPE_CONFIG[offer.offer_type ?? ''] ?? { color: 'text-zinc-300', bg: 'bg-zinc-800', border: 'border-zinc-700' };
  const isActive = offer.selling === '✅ Yes' && offer.status !== '❌ No Longer Selling';
  const isInactive = offer.status === '❌ No Longer Selling' || offer.selling !== '✅ Yes';
  const days = daysSince(offer.start_date);
  const msgDone = hasMessaging(offer);

  return (
    <div className={`relative bg-zinc-900 border rounded-xl p-4 transition-all group ${isInactive ? 'border-zinc-800/50 opacity-50' : 'border-zinc-800 hover:border-zinc-600 hover:scale-[1.005]'}`}>
      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          onClick={(e) => { e.stopPropagation(); onDeactivate(); }}
          title={isActive ? 'Deactivate' : 'Reactivate'}
          className={`p-1 rounded-md text-xs transition-colors ${isActive ? 'hover:bg-red-500/20 hover:text-red-400 text-zinc-500' : 'hover:bg-emerald-500/20 hover:text-emerald-400 text-zinc-500'}`}
        >
          {isActive ? '⏸' : '▶'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete"
          className="p-1 rounded-md text-xs text-zinc-500 hover:bg-red-500/20 hover:text-red-400 transition-colors"
        >
          🗑
        </button>
      </div>

      <button onClick={onSelect} className="w-full text-left">
        <div className="flex items-start gap-2 mb-3 pr-14">
          <div className="flex-1 min-w-0">
            <h3 className={`font-semibold text-sm leading-tight truncate ${isInactive ? 'text-zinc-500' : 'text-white'}`}>{offer.name ?? 'Untitled'}</h3>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                {typeLabel(offer.offer_type)}
              </span>
              {msgDone && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">✍️ Messaging</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
          <span className="text-xl font-bold text-white">{fmt$(offer.pif_price)}</span>
          {offer.pp_down && <span className="text-xs text-zinc-500">or {fmt$(offer.pp_down)}/mo</span>}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-zinc-800/60 rounded-lg p-2 text-center">
            <div className="text-base font-bold text-white">{(offer.num_sales ?? 0).toLocaleString()}</div>
            <div className="text-[10px] text-zinc-500">Sales</div>
          </div>
          <div className="bg-zinc-800/60 rounded-lg p-2 text-center">
            <div className="text-base font-bold text-emerald-400">{fmt$(offer.revenue)}</div>
            <div className="text-[10px] text-zinc-500">Revenue</div>
          </div>
          <div className="bg-zinc-800/60 rounded-lg p-2 text-center">
            {offer.spots_available ? (
              <>
                <div className="text-base font-bold text-sky-400">{offer.spots_available}</div>
                <div className="text-[10px] text-zinc-500">Spots</div>
              </>
            ) : (
              <>
                <div className="text-base font-bold text-zinc-400">{days != null ? `${days}d` : '—'}</div>
                <div className="text-[10px] text-zinc-500">Days live</div>
              </>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}

// ─── Messaging Tab ────────────────────────────────────────────────────────────

function MessagingTab({ offer, onUpdate }: { offer: Offer; onUpdate: (updates: Partial<Offer>) => void }) {
  const [generating, setGenerating] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [brainDump, setBrainDump] = useState('');
  const [showBrainDump, setShowBrainDump] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  async function generate(section: MessagingSection | 'all') {
    setGenerating(section);
    setError(null);
    try {
      const res = await fetch('/api/offers/messaging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offer_id: offer.id,
          brain_dump: brainDump,
          section,
        }),
      });
      const json = await res.json() as Record<string, string> & { error?: string };
      if (json.error) throw new Error(json.error);
      const updates: Partial<Offer> = {};
      for (const s of MESSAGING_SECTIONS) {
        if (json[s.key]) (updates as Record<string, string>)[s.key] = json[s.key];
      }
      onUpdate(updates);
      if (section === 'all') setShowBrainDump(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(null);
    }
  }

  const msgFilled = MESSAGING_SECTIONS.filter((s) => (offer as Record<string, unknown>)[s.key]).length;

  return (
    <div className="space-y-5">
      {/* Brain dump / regenerate all */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold text-white">🧠 AI Messaging</div>
            <div className="text-xs text-zinc-500 mt-0.5">
              {msgFilled}/{MESSAGING_SECTIONS.length} sections filled
              {msgFilled > 0 && <span className="text-emerald-400 ml-1">· Frameworks: Hormozi + Brunson + Ovens + Kroeze</span>}
            </div>
          </div>
          <button
            onClick={() => setShowBrainDump(!showBrainDump)}
            className="text-xs px-3 py-1.5 bg-white text-zinc-900 font-semibold rounded-lg hover:bg-zinc-100 transition-colors"
          >
            {showBrainDump ? '↑ Hide' : msgFilled > 0 ? '♻️ Regenerate All' : '✨ Generate All'}
          </button>
        </div>

        {showBrainDump && (
          <div className="space-y-3">
            <textarea
              value={brainDump}
              onChange={(e) => setBrainDump(e.target.value)}
              placeholder="Optional: add extra context to improve the messaging (unique angles, specific client wins, launch details, pricing rationale...)"
              rows={4}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500 resize-none"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              onClick={() => void generate('all')}
              disabled={generating === 'all'}
              className="w-full py-2.5 bg-white text-zinc-900 font-bold rounded-lg text-sm hover:bg-zinc-100 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {generating === 'all' ? (
                <>
                  <span className="w-4 h-4 border-2 border-zinc-400 border-t-zinc-900 rounded-full animate-spin" />
                  Generating all 10 sections…
                </>
              ) : '✨ Generate All Messaging'}
            </button>
          </div>
        )}
      </div>

      {/* Individual sections */}
      {MESSAGING_SECTIONS.map(({ key, emoji, label, desc }) => {
        const value = (offer as Record<string, string | null>)[key];
        const isGenerating = generating === key;
        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">{emoji} {label}</span>
                <span className="text-[10px] text-zinc-600 ml-2">{desc}</span>
              </div>
              <div className="flex items-center gap-1">
                {value && (
                  <button
                    onClick={() => copy(value, key)}
                    className="text-[10px] text-zinc-600 hover:text-zinc-300 px-2 py-1 transition-colors"
                  >
                    {copied === key ? '✓' : 'Copy'}
                  </button>
                )}
                <button
                  onClick={() => void generate(key as MessagingSection)}
                  disabled={!!generating}
                  className="text-[10px] px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors disabled:opacity-40"
                >
                  {isGenerating ? (
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 border border-zinc-400 border-t-transparent rounded-full animate-spin inline-block" />
                      Generating
                    </span>
                  ) : value ? '♻️ Redo' : '✨ Generate'}
                </button>
              </div>
            </div>
            {value ? (
              <div className="bg-zinc-800/60 rounded-xl px-4 py-3 text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{value}</div>
            ) : (
              <div className="bg-zinc-800/30 rounded-xl px-4 py-3 text-sm text-zinc-600 italic">
                Not generated yet — hit ✨ Generate or use Generate All above.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({ offer: initialOffer, onClose, onDeactivate, onDelete }: {
  offer: Offer;
  onClose: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) {
  const [offer, setOffer] = useState(initialOffer);
  const cfg = TYPE_CONFIG[offer.offer_type ?? ''] ?? { color: 'text-zinc-300', bg: 'bg-zinc-800', border: 'border-zinc-700' };
  const [tab, setTab] = useState<'overview' | 'scripts' | 'messaging' | 'links' | 'edit'>('overview');
  const [scriptsGenerating, setScriptsGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editForm, setEditForm] = useState({
    name: offer.name ?? '',
    pif_price: offer.pif_price?.toString() ?? '',
    pp_down: offer.pp_down?.toString() ?? '',
    pp_price: offer.pp_price?.toString() ?? '',
    spots_available: offer.spots_available?.toString() ?? '',
    enrollment_target: offer.enrollment_target?.toString() ?? '',
    target_revenue: offer.target_revenue?.toString() ?? '',
    pif_link: offer.pif_link ?? '',
    pp_link: offer.pp_link ?? '',
    payment_link: offer.payment_link ?? '',
    sales_page: offer.sales_page ?? '',
    purchase_page: offer.purchase_page ?? '',
    offer_1_sheeter: offer.offer_1_sheeter ?? '',
    onboarding_link: offer.onboarding_link ?? '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editSaved, setEditSaved] = useState(false);

  const saveEdit = async () => {
    setEditSaving(true);
    const updates: Partial<Offer> = {
      name: editForm.name || null,
      pif_price: editForm.pif_price ? Number(editForm.pif_price) : null,
      pp_down: editForm.pp_down ? Number(editForm.pp_down) : null,
      pp_price: editForm.pp_price ? Number(editForm.pp_price) : null,
      spots_available: editForm.spots_available ? Number(editForm.spots_available) : null,
      enrollment_target: editForm.enrollment_target ? Number(editForm.enrollment_target) : null,
      target_revenue: editForm.target_revenue ? Number(editForm.target_revenue) : null,
      pif_link: editForm.pif_link || null,
      pp_link: editForm.pp_link || null,
      payment_link: editForm.payment_link || null,
      sales_page: editForm.sales_page || null,
      purchase_page: editForm.purchase_page || null,
      offer_1_sheeter: editForm.offer_1_sheeter || null,
      onboarding_link: editForm.onboarding_link || null,
    };
    const res = await fetch('/api/offers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: offer.id, ...updates }),
    });
    const data = await res.json() as { offer?: Offer };
    if (data.offer) setOffer(data.offer);
    setEditSaving(false);
    setEditSaved(true);
    setTimeout(() => setEditSaved(false), 2000);
  };
  const isActive = offer.selling === '✅ Yes' && offer.status !== '❌ No Longer Selling';

  const revPct = offer.target_revenue && offer.revenue
    ? Math.min(100, Math.round((offer.revenue / offer.target_revenue) * 100))
    : null;

  const enrollPct = offer.enrollment_target && offer.num_sales
    ? Math.min(100, Math.round((offer.num_sales / offer.enrollment_target) * 100))
    : null;

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  function handleMessagingUpdate(updates: Partial<Offer>) {
    setOffer((prev) => ({ ...prev, ...updates }));
  }

  const links = [
    { label: '💳 PIF Link', url: offer.pif_link },
    { label: '📅 Payment Plan Link', url: offer.pp_link },
    { label: '🔗 Payment Link', url: offer.payment_link },
    { label: '🌐 Sales Page', url: offer.sales_page },
    { label: '📄 Purchase Page', url: offer.purchase_page },
    { label: '📋 Offer 1-Sheeter', url: offer.offer_1_sheeter },
    { label: '🚀 Onboarding Link', url: offer.onboarding_link },
  ].filter((l) => l.url);

  const msgDone = hasMessaging(offer);

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="w-full md:max-w-xl bg-zinc-900 border border-zinc-700 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex-shrink-0 p-5 border-b border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white leading-tight">{offer.name}</h2>
                {isActive && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                  {offer.offer_type}
                </span>
                {msgDone && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">✍️ Messaging ready</span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-white text-2xl leading-none flex-shrink-0">×</button>
          </div>

          {/* Pricing row */}
          <div className="flex flex-wrap gap-4 mt-3">
            {offer.pif_price && (
              <div><div className="text-xs text-zinc-500">PIF</div><div className="text-2xl font-bold text-white">{fmt$(offer.pif_price)}</div></div>
            )}
            {offer.pp_down && (
              <div><div className="text-xs text-zinc-500">Down</div><div className="text-2xl font-bold text-zinc-200">{fmt$(offer.pp_down)}</div></div>
            )}
            {offer.pp_price && (
              <div><div className="text-xs text-zinc-500">PP Total</div><div className="text-xl font-bold text-zinc-300">{fmt$(offer.pp_price)}</div></div>
            )}
          </div>

          {/* Progress bars */}
          {(revPct !== null || enrollPct !== null) && (
            <div className="mt-3 space-y-2">
              {revPct !== null && (
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                    <span>💰 Revenue</span>
                    <span>{fmt$(offer.revenue)} / {fmt$(offer.target_revenue)} · {revPct}%</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${revPct}%` }} />
                  </div>
                </div>
              )}
              {enrollPct !== null && (
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                    <span>🎯 Enrollment</span>
                    <span>{offer.num_sales} / {offer.enrollment_target} · {enrollPct}%</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${enrollPct}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 flex border-b border-zinc-800">
          {(['overview', 'scripts', 'messaging', 'links', 'edit'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors relative ${tab === t ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {t === 'overview' ? '📊 Overview' : t === 'scripts' ? '🎯 Scripts' : t === 'messaging' ? '✍️ Messaging' : t === 'links' ? '🔗 Links' : '✏️ Edit'}
              {tab === t && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />}
              {t === 'messaging' && !msgDone && (
                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" title="No messaging yet" />
              )}
              {t === 'scripts' && !offer.setting_scripts && (
                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" title="No scripts yet" />
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-zinc-800 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-white">{(offer.num_sales ?? 0).toLocaleString()}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">🏷️ Sales</div>
                </div>
                <div className="bg-zinc-800 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-400">{fmt$(offer.revenue)}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">💰 Revenue</div>
                </div>
                <div className="bg-zinc-800 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-sky-400">{offer.spots_available ?? '∞'}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">🎯 Spots</div>
                </div>
              </div>

              {offer.start_date && (
                <div className="bg-zinc-800/50 rounded-lg px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-zinc-400">🚀 Launch date</span>
                  <span className="text-xs font-medium text-zinc-200">
                    {new Date(offer.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    {daysSince(offer.start_date) != null && ` · ${daysSince(offer.start_date)}d ago`}
                  </span>
                </div>
              )}

              {offer.num_sales && offer.pif_price ? (
                <div className="bg-zinc-800/50 rounded-lg px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-zinc-400">📈 Avg Revenue/Sale</span>
                  <span className="text-xs font-medium text-zinc-200">{fmt$((offer.revenue ?? 0) / offer.num_sales)}</span>
                </div>
              ) : null}

              {offer.who_its_for && (
                <div>
                  <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">👤 Who it's for</div>
                  <p className="text-sm text-zinc-300 leading-relaxed">{offer.who_its_for}</p>
                </div>
              )}
              {offer.promise && (
                <div>
                  <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">🏆 The Promise</div>
                  <p className="text-sm text-zinc-300 leading-relaxed">{offer.promise}</p>
                </div>
              )}
              {offer.pain_points && (
                <div>
                  <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">🔥 Pain Points</div>
                  <ul className="space-y-1">
                    {offer.pain_points.split('\n').map((p, i) => (
                      <li key={i} className="text-sm text-zinc-300 flex gap-2"><span className="text-zinc-600">•</span>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!msgDone && (
                <button
                  onClick={() => setTab('messaging')}
                  className="w-full py-3 border border-dashed border-zinc-700 rounded-xl text-sm text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
                >
                  ✍️ Generate AI Messaging →
                </button>
              )}
            </>
          )}

          {tab === 'scripts' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">🎯 DM Setting Scripts</p>
                  <p className="text-xs text-zinc-500 mt-0.5">The exact messages to book calls for this offer. Tap any to copy.</p>
                </div>
                <button
                  onClick={async () => {
                    setScriptsGenerating(true);
                    const res = await fetch('/api/offers/setting-scripts', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ offer_id: offer.id }),
                    });
                    const json = await res.json() as { setting_scripts?: SettingScripts };
                    if (json.setting_scripts) setOffer((prev) => ({ ...prev, setting_scripts: json.setting_scripts! }));
                    setScriptsGenerating(false);
                  }}
                  disabled={scriptsGenerating}
                  className="px-3 py-1.5 text-xs bg-white text-zinc-900 font-bold rounded-lg hover:bg-zinc-100 transition-colors disabled:opacity-40 flex-shrink-0"
                >
                  {scriptsGenerating ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 border-2 border-zinc-400 border-t-zinc-900 rounded-full animate-spin" />
                      Writing…
                    </span>
                  ) : offer.setting_scripts ? '♻️ Regenerate' : '✨ Generate Scripts'}
                </button>
              </div>

              {!offer.setting_scripts ? (
                <div className="text-center py-12 text-zinc-600">
                  <div className="text-4xl mb-3">🎯</div>
                  <p className="text-sm">No setting scripts yet.<br />Hit <strong className="text-zinc-400">✨ Generate Scripts</strong> to write the full DM pack for this offer.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {SCRIPT_LABELS.filter((s) => offer.setting_scripts?.[s.key]).map((s) => (
                    <button
                      key={s.key}
                      onClick={() => copy(offer.setting_scripts![s.key]!, `script_${s.key}`)}
                      className="w-full text-left bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/60 hover:border-zinc-600 rounded-xl p-3.5 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-zinc-300">{s.emoji} {s.label}</span>
                        <span className="text-[10px] text-zinc-600">{copied === `script_${s.key}` ? '✓ Copied!' : s.desc}</span>
                      </div>
                      <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{offer.setting_scripts![s.key]}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'messaging' && (
            <MessagingTab
              offer={offer}
              onUpdate={handleMessagingUpdate}
            />
          )}

          {tab === 'links' && (
            links.length > 0 ? (
              <div className="space-y-2">
                {links.map(({ label, url }) => (
                  <a key={label} href={url!} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between bg-zinc-800 hover:bg-zinc-700 rounded-xl px-4 py-3 transition-colors group">
                    <span className="text-sm text-zinc-200">{label}</span>
                    <span className="text-zinc-500 group-hover:text-zinc-300 text-xs truncate max-w-[160px]">
                      {url?.replace(/^https?:\/\//, '').slice(0, 28)}… ↗
                    </span>
                  </a>
                ))}
                <div className="pt-2">
                  <button
                    onClick={() => copy(links.map((l) => `${l.label}: ${l.url}`).join('\n'), 'links')}
                    className="w-full py-2 text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded-lg transition-colors"
                  >
                    {copied === 'links' ? '✓ Copied all links' : 'Copy all links'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-600 text-center py-8">No links added yet. Add them below in the Edit tab.</p>
            )
          )}

          {tab === 'edit' && (
            <div className="space-y-5">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Offer Name</label>
                <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
              </div>

              {/* Pricing */}
              <div>
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">💰 Pricing</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'pif_price', label: 'PIF Price ($)' },
                    { key: 'pp_down', label: 'Down Payment ($)' },
                    { key: 'pp_price', label: 'PP Total ($)' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
                      <input type="number" value={(editForm as Record<string, string>)[key]}
                        onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                        placeholder="0"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Targets */}
              <div>
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">🎯 Targets</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'spots_available', label: 'Spots Available' },
                    { key: 'enrollment_target', label: 'Enrollment Target' },
                    { key: 'target_revenue', label: 'Revenue Target ($)' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
                      <input type="number" value={(editForm as Record<string, string>)[key]}
                        onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                        placeholder="0"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment links */}
              <div>
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">🔗 Payment Links</div>
                <div className="space-y-2">
                  {[
                    { key: 'pif_link', label: '💳 PIF Link' },
                    { key: 'pp_link', label: '📅 Payment Plan Link' },
                    { key: 'payment_link', label: '🔗 General Payment Link' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
                      <input type="url" value={(editForm as Record<string, string>)[key]}
                        onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                        placeholder="https://"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none focus:border-blue-500" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Other links */}
              <div>
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">🌐 Other Links</div>
                <div className="space-y-2">
                  {[
                    { key: 'sales_page', label: '🌐 Sales Page' },
                    { key: 'purchase_page', label: '📄 Purchase Page' },
                    { key: 'offer_1_sheeter', label: '📋 Offer 1-Sheeter' },
                    { key: 'onboarding_link', label: '🚀 Onboarding Link' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
                      <input type="url" value={(editForm as Record<string, string>)[key]}
                        onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                        placeholder="https://"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none focus:border-blue-500" />
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => void saveEdit()}
                disabled={editSaving}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                {editSaving ? 'Saving…' : editSaved ? '✓ Saved' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        {/* Action footer */}
        <div className="flex-shrink-0 border-t border-zinc-800 p-4 flex gap-2">
          {confirmDelete ? (
            <>
              <span className="flex-1 text-xs text-red-400 flex items-center">Delete permanently?</span>
              <button onClick={() => setConfirmDelete(false)}
                className="px-3 py-2 text-xs bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700 transition-colors">
                Cancel
              </button>
              <button onClick={() => { onDelete(); onClose(); }}
                className="px-3 py-2 text-xs bg-red-600 hover:bg-red-500 rounded-lg text-white font-semibold transition-colors">
                Yes, delete
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onDeactivate}
                className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  isActive
                    ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-red-500/50 hover:text-red-400'
                    : 'bg-emerald-600/20 border-emerald-600/30 text-emerald-400 hover:bg-emerald-600/30'
                }`}
              >
                {isActive ? '⏸ Deactivate' : '▶ Reactivate'}
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-2 text-xs bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-500 hover:text-red-400 hover:border-red-500/30 transition-colors"
              >
                🗑 Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Brain Dump Modal ─────────────────────────────────────────────────────────

const WIZARD_STEPS: { key: string; emoji: string; question: string; hint: string; placeholder: string; required: boolean }[] = [
  { key: 'who',      emoji: '🧍', question: 'Who is this offer for?', hint: 'Their current situation, revenue level, what they do', placeholder: 'e.g. Coaches doing $10-20K/month who are stuck doing everything themselves and can\'t break past their ceiling...', required: true },
  { key: 'problem',  emoji: '🔥', question: 'What problem does it solve?', hint: 'The pain that keeps them up at night', placeholder: 'e.g. They post content daily but leads are inconsistent. Some months are great, some are dead. No predictable way to get clients...', required: true },
  { key: 'outcome',  emoji: '🏆', question: 'What result do they get?', hint: 'The specific transformation, ideally with a timeframe', placeholder: 'e.g. A consistent $30K/month within 6 months, working 30 hours a week with a lean team...', required: true },
  { key: 'included', emoji: '📦', question: 'What\'s included?', hint: 'Format, deliverables, length, access level', placeholder: 'e.g. 6-month program, 3 group calls/week, 1:1 Slack access, plug-and-play systems, 2 in-person events...', required: false },
  { key: 'price',    emoji: '💰', question: 'Pricing thoughts?', hint: 'Leave blank and Claude will recommend based on your price ladder', placeholder: 'e.g. Thinking $15K PIF or $3K down + $1.5K/month... or leave blank for a recommendation', required: false },
  { key: 'proof',    emoji: '⭐', question: 'What proof do you have?', hint: 'Client results, testimonials, your own results', placeholder: 'e.g. Kavetha went $20K to $160K/month in 4 months. Rae hit $155K/month. 122 clients to 7 figures...', required: false },
];

function BrainDumpModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [mode, setMode] = useState<'guided' | 'dump'>('guided');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratedOffer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentStep = WIZARD_STEPS[step];
  const canNext = !currentStep?.required || (answers[currentStep.key] ?? '').trim().length > 0;
  const isLastStep = step === WIZARD_STEPS.length - 1;
  const guidedReady = WIZARD_STEPS.filter((s) => s.required).every((s) => (answers[s.key] ?? '').trim());

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const payload = mode === 'guided' ? { answers } : { brain_dump: text };
      const res = await fetch('/api/offers/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json() as GeneratedOffer;
      if (json.error) throw new Error(json.error);
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="w-full md:max-w-2xl bg-zinc-900 border border-zinc-700 rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex-shrink-0 flex items-center justify-between p-5 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-bold text-white">✨ New Offer</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Answer a few questions. Claude writes the offer, messaging, and DM scripts.</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {!result ? (
            <>
              {/* Mode toggle */}
              <div className="flex gap-1 bg-zinc-800 rounded-xl p-1">
                <button
                  onClick={() => setMode('guided')}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${mode === 'guided' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  🧭 Guided (recommended)
                </button>
                <button
                  onClick={() => setMode('dump')}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${mode === 'dump' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  🧠 Brain Dump
                </button>
              </div>

              {mode === 'guided' ? (
                <>
                  {/* Progress dots */}
                  <div className="flex items-center justify-center gap-2">
                    {WIZARD_STEPS.map((s, i) => {
                      const filled = (answers[s.key] ?? '').trim().length > 0;
                      return (
                        <button
                          key={s.key}
                          onClick={() => setStep(i)}
                          className={`h-2 rounded-full transition-all ${i === step ? 'w-6 bg-white' : filled ? 'w-2 bg-emerald-500' : 'w-2 bg-zinc-700'}`}
                          title={s.question}
                        />
                      );
                    })}
                  </div>

                  {/* Current question */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-white font-bold text-base">{currentStep.emoji} {currentStep.question} {!currentStep.required && <span className="text-zinc-600 text-xs font-normal">(optional)</span>}</p>
                      <p className="text-zinc-500 text-xs mt-1">{currentStep.hint}</p>
                    </div>
                    <textarea
                      key={currentStep.key}
                      autoFocus
                      value={answers[currentStep.key] ?? ''}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [currentStep.key]: e.target.value }))}
                      placeholder={currentStep.placeholder}
                      rows={5}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500 resize-none"
                    />
                  </div>

                  {error && <p className="text-sm text-red-400">{error}</p>}

                  {/* Nav */}
                  <div className="flex gap-2">
                    {step > 0 && (
                      <button onClick={() => setStep(step - 1)} className="px-4 py-3 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-xl text-sm font-medium hover:bg-zinc-700 transition-colors">
                        ← Back
                      </button>
                    )}
                    {!isLastStep ? (
                      <button
                        onClick={() => setStep(step + 1)}
                        disabled={!canNext}
                        className="flex-1 py-3 bg-white text-zinc-900 font-bold rounded-xl hover:bg-zinc-100 transition-colors disabled:opacity-40 text-sm"
                      >
                        Next →
                      </button>
                    ) : (
                      <button
                        onClick={generate}
                        disabled={loading || !guidedReady}
                        className="flex-1 py-3 bg-white text-zinc-900 font-bold rounded-xl hover:bg-zinc-100 transition-colors disabled:opacity-40 text-sm"
                      >
                        {loading ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="w-4 h-4 border-2 border-zinc-400 border-t-zinc-900 rounded-full animate-spin" />
                            Building offer + scripts…
                          </span>
                        ) : '✨ Create Offer'}
                      </button>
                    )}
                  </div>
                  {isLastStep && !guidedReady && (
                    <p className="text-xs text-amber-400 text-center">Fill in the first 3 questions (who, problem, result) to create the offer.</p>
                  )}
                </>
              ) : (
                <>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={'Brain dump your offer here...\n\nWho is it for? What\'s the price? What\'s the result they get? What problem does it solve? What\'s included? Any launch dates or event details?'}
                    rows={8}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500 resize-none"
                  />
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <button
                    onClick={generate}
                    disabled={loading || !text.trim()}
                    className="w-full py-3.5 bg-white text-zinc-900 font-bold rounded-xl hover:bg-zinc-100 transition-colors disabled:opacity-40 text-sm"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-zinc-400 border-t-zinc-900 rounded-full animate-spin" />
                        Building offer profile…
                      </span>
                    ) : '✨ Generate Offer Profile'}
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <div className="space-y-4">
                <div className="bg-zinc-800 rounded-xl p-4">
                  <div className="text-xs text-zinc-500 mb-1">Offer</div>
                  <div className="text-xl font-bold text-white">{result.name}</div>
                  <div className="text-xs text-zinc-400 mt-1">{result.offer_type}</div>
                </div>

                {(result.pif_price > 0 || result.pp_down > 0) && (
                  <div className="grid grid-cols-3 gap-3">
                    {result.pif_price > 0 && (
                      <div className="bg-zinc-800 rounded-xl p-3 text-center">
                        <div className="text-xs text-zinc-500 mb-1">PIF Price</div>
                        <div className="text-lg font-bold text-white">${result.pif_price.toLocaleString()}</div>
                      </div>
                    )}
                    {result.pp_down > 0 && (
                      <div className="bg-zinc-800 rounded-xl p-3 text-center">
                        <div className="text-xs text-zinc-500 mb-1">Down</div>
                        <div className="text-lg font-bold text-zinc-200">${result.pp_down.toLocaleString()}</div>
                      </div>
                    )}
                    {result.pp_price > 0 && (
                      <div className="bg-zinc-800 rounded-xl p-3 text-center">
                        <div className="text-xs text-zinc-500 mb-1">PP Total</div>
                        <div className="text-lg font-bold text-zinc-200">${result.pp_price.toLocaleString()}</div>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Who It's For</div>
                  <p className="text-sm text-zinc-300 leading-relaxed">{result.who_its_for}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">The Promise</div>
                  <p className="text-sm text-zinc-300 leading-relaxed">{result.promise}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Pain Points</div>
                  <ul className="space-y-1">
                    {result.pain_points.map((p, i) => (
                      <li key={i} className="text-sm text-zinc-300 flex gap-2"><span className="text-zinc-600">•</span>{p}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">DM Copy</div>
                  <div className="bg-zinc-800 rounded-xl p-4 text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{result.dm_copy}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Ad Copy</div>
                  <div className="bg-zinc-800 rounded-xl p-4 text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{result.ad_copy}</div>
                </div>

                {result.recommended_price_reasoning && (
                  <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
                    <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">Pricing Rationale</div>
                    <p className="text-sm text-zinc-400">{result.recommended_price_reasoning}</p>
                  </div>
                )}

                {result.links_needed.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                    <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">Links to create</div>
                    <ul className="space-y-1">
                      {result.links_needed.map((l, i) => (
                        <li key={i} className="text-sm text-amber-300/80 flex gap-2"><span className="text-amber-600">→</span>{l}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.airtable_id && (
                  <p className="text-xs text-emerald-400 text-center">✓ Saved to Airtable · ID: {result.airtable_id}</p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setResult(null); setText(''); }}
                  className="flex-1 py-3 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-xl text-sm hover:bg-zinc-700 transition-colors"
                >
                  ← Start Over
                </button>
                <button
                  onClick={() => { onCreated(); onClose(); }}
                  className="flex-1 py-3 bg-white text-zinc-900 font-bold rounded-xl text-sm hover:bg-zinc-100 transition-colors"
                >
                  Done ✓
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TYPE_ORDER = [
  '🎖️ High Ticket Offer',
  '🧲 Low Ticket Offer',
  '👨‍👨‍👦‍👦 Event - In Person',
  '💻 Event - Online',
  '🖥️ Course Offer',
  '💪 Done For You',
  '⭐️ Sponsorship',
];

// ─── Offers Data (analytics) ──────────────────────────────────────────────────

function OffersData({ offers }: { offers: Offer[] }) {
  const withSales = offers.filter((o) => (o.num_sales ?? 0) > 0);
  const totalRev = offers.reduce((s, o) => s + (o.revenue ?? 0), 0);
  const totalSales = offers.reduce((s, o) => s + (o.num_sales ?? 0), 0);
  const avgDeal = totalSales > 0 ? totalRev / totalSales : 0;

  const byRevenue = [...withSales].sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));
  const maxRev = Math.max(...byRevenue.map((o) => o.revenue ?? 0), 1);

  // Aggregate by type
  const typeAgg: Record<string, { revenue: number; sales: number }> = {};
  for (const o of withSales) {
    const t = o.offer_type ?? 'Other';
    if (!typeAgg[t]) typeAgg[t] = { revenue: 0, sales: 0 };
    typeAgg[t].revenue += o.revenue ?? 0;
    typeAgg[t].sales += o.num_sales ?? 0;
  }
  const typeRows = Object.entries(typeAgg).sort((a, b) => b[1].revenue - a[1].revenue);
  const maxTypeRev = Math.max(...typeRows.map(([, v]) => v.revenue), 1);

  return (
    <div className="space-y-6">
      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-emerald-400">{fmt$(totalRev)}</div>
          <div className="text-xs text-zinc-500 uppercase tracking-wide mt-1">Total Revenue</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-white">{totalSales.toLocaleString()}</div>
          <div className="text-xs text-zinc-500 uppercase tracking-wide mt-1">Total Sales</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-blue-400">{fmt$(avgDeal)}</div>
          <div className="text-xs text-zinc-500 uppercase tracking-wide mt-1">Avg Deal Size</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-violet-400">{withSales.length}</div>
          <div className="text-xs text-zinc-500 uppercase tracking-wide mt-1">Offers w/ Sales</div>
        </div>
      </div>

      {/* Revenue by offer */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-zinc-200 mb-4">💰 Revenue by Offer</h3>
        {byRevenue.length === 0 ? <p className="text-zinc-600 text-sm text-center py-4">No tracked sales yet.</p> : (
          <div className="space-y-3">
            {byRevenue.map((o) => (
              <div key={o.id}>
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className="text-xs text-zinc-300 truncate">{o.name}</span>
                  <span className="text-xs font-semibold text-zinc-400 flex-shrink-0">{fmt$(o.revenue)} · {o.num_sales} sales</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all" style={{ width: `${Math.round(((o.revenue ?? 0) / maxRev) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Revenue by type */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-zinc-200 mb-4">🏷️ Revenue by Type</h3>
        {typeRows.length === 0 ? <p className="text-zinc-600 text-sm text-center py-4">No tracked sales yet.</p> : (
          <div className="space-y-3">
            {typeRows.map(([type, v]) => (
              <div key={type}>
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className="text-xs text-zinc-300 truncate">{type}</span>
                  <span className="text-xs font-semibold text-zinc-400 flex-shrink-0">{fmt$(v.revenue)} · {v.sales} sales</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all" style={{ width: `${Math.round((v.revenue / maxTypeRev) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Grid Offer Card ──────────────────────────────────────────────────────────

function LinkChip({ label, url }: { label: string; url: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!url) return (
    <span className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-800 text-zinc-600 text-xs">{label} <span className="text-zinc-700">—</span></span>
  );
  return (
    <div className="flex items-center rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden">
      <button
        onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
      >
        {copied ? '✓ Copied' : label}
      </button>
      <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
        className="px-1.5 py-1.5 text-zinc-500 hover:text-white hover:bg-zinc-700 border-l border-zinc-700 transition-colors text-xs">↗</a>
    </div>
  );
}

function GridOfferCard({ offer, onSelect }: { offer: Offer; onSelect: () => void }) {
  const cfg = TYPE_CONFIG[offer.offer_type ?? ''] ?? { color: 'text-zinc-300', bg: 'bg-zinc-800', border: 'border-zinc-700' };
  const isActive = offer.selling === '✅ Yes' && offer.status !== '❌ No Longer Selling';
  const payLink = offer.payment_link || offer.pif_link || offer.pp_link;

  return (
    <div
      onClick={onSelect}
      className={`bg-zinc-900 border rounded-2xl p-4 cursor-pointer transition-all ${isActive ? 'border-zinc-800 hover:border-zinc-600' : 'border-zinc-800/50 opacity-60 hover:opacity-100'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-sm text-white leading-tight">{offer.name ?? 'Untitled'}</h3>
        <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border} whitespace-nowrap`}>{typeLabel(offer.offer_type)}</span>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
        <span className="text-lg font-bold text-white">{fmt$(offer.pif_price)}</span>
        {offer.pp_down ? <span className="text-xs text-zinc-500">or {fmt$(offer.pp_down)}/mo</span> : null}
      </div>

      {/* Sales + revenue */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-zinc-800/60 rounded-lg py-2 text-center">
          <div className="text-lg font-bold text-white leading-none">{(offer.num_sales ?? 0).toLocaleString()}</div>
          <div className="text-[10px] text-zinc-500 mt-1">Clients / Sales</div>
        </div>
        <div className="bg-zinc-800/60 rounded-lg py-2 text-center">
          <div className="text-lg font-bold text-emerald-400 leading-none">{fmt$(offer.revenue)}</div>
          <div className="text-[10px] text-zinc-500 mt-1">Revenue</div>
        </div>
      </div>

      {/* Direct links to send */}
      <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
        <LinkChip label="🌐 Sales Page" url={offer.sales_page} />
        <LinkChip label="💳 Pay Link" url={payLink} />
      </div>
    </div>
  );
}

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Offer | null>(null);
  const [showBrainDump, setShowBrainDump] = useState(false);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [view, setView] = useState<'grid' | 'current' | 'data'>('grid');
  const [typeTab, setTypeTab] = useState<string>('all');

  const [liveStats, setLiveStats] = useState<Record<string, { revenue: number; count: number }>>({});

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/offers');
    const json = await res.json() as { offers: Offer[] };
    setOffers(json.offers ?? []);
    setLoading(false);
    // Live tracked stats (sales calls + collected payments matched by offer name)
    fetch('/api/offers/stats')
      .then((r) => r.json())
      .then((s: { stats?: Record<string, { revenue: number; count: number }> }) => setLiveStats(s.stats ?? {}))
      .catch(() => {});
  }, []);

  useEffect(() => { void fetchOffers(); }, [fetchOffers]);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    const res = await fetch('/api/offers/sync', { method: 'POST' });
    const json = await res.json() as { count: number; errors: number };
    setSyncMsg(`✓ Synced ${json.count} offers`);
    setSyncing(false);
    void fetchOffers();
  }

  async function handleDeactivate(offer: Offer) {
    const isActive = offer.selling === '✅ Yes' && offer.status !== '❌ No Longer Selling';
    const updates = isActive
      ? { selling: '✅ Yes', status: '❌ No Longer Selling' }
      : { selling: '✅ Yes', status: '✅ Launched' };
    await fetch('/api/offers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: offer.id, ...updates }),
    });
    setOffers((prev) => prev.map((o) => o.id === offer.id ? { ...o, ...updates } : o));
    if (selected?.id === offer.id) setSelected((s) => s ? { ...s, ...updates } : s);
  }

  async function handleDelete(offer: Offer) {
    await fetch('/api/offers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: offer.id }),
    });
    setOffers((prev) => prev.filter((o) => o.id !== offer.id));
    if (selected?.id === offer.id) setSelected(null);
  }

  // Live tracked stats (from actual sales calls + collected payments) are ground truth
  const effectiveOffers = useMemo(() => offers.map((o) => {
    const live = liveStats[o.id];
    if (!live || live.count === 0) return o;
    return { ...o, revenue: live.revenue, num_sales: live.count };
  }), [offers, liveStats]);

  const displayed = useMemo(() => {
    if (filter === 'active') {
      return effectiveOffers.filter((o) => o.selling === '✅ Yes' && o.status !== '❌ No Longer Selling');
    }
    const active = effectiveOffers.filter((o) => o.selling === '✅ Yes' && o.status !== '❌ No Longer Selling');
    const inactive = effectiveOffers.filter((o) => o.status === '❌ No Longer Selling' || o.selling !== '✅ Yes');
    return [...active, ...inactive];
  }, [effectiveOffers, filter]);

  const grouped = useMemo(() => {
    const g: Record<string, Offer[]> = {};
    for (const o of displayed) {
      const t = o.offer_type ?? 'Other';
      if (!g[t]) g[t] = [];
      g[t].push(o);
    }
    return TYPE_ORDER
      .filter((t) => g[t]?.length)
      .map((t) => {
        const sorted = [
          ...g[t].filter((o) => o.status !== '❌ No Longer Selling' && o.selling === '✅ Yes'),
          ...g[t].filter((o) => o.status === '❌ No Longer Selling' || o.selling !== '✅ Yes'),
        ];
        return { type: t, items: sorted };
      });
  }, [displayed]);

  const activeOffers = effectiveOffers.filter((o) => o.selling === '✅ Yes' && o.status === '✅ Launched');
  const totalRevenue = effectiveOffers.reduce((s, o) => s + (o.revenue ?? 0), 0);
  const totalSales = effectiveOffers.reduce((s, o) => s + (o.num_sales ?? 0), 0);
  const withMessaging = effectiveOffers.filter((o) => hasMessaging(o)).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top bar */}
      <div className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm px-4 md:px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Offers</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View switch */}
            <div className="flex bg-zinc-800 border border-zinc-700 rounded-lg p-0.5 gap-0.5">
              {([['grid', '🔲 Grid'], ['current', '📋 Current'], ['data', '📊 Data']] as const).map(([k, lbl]) => (
                <button key={k} onClick={() => setView(k)}
                  className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${view === k ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
                  {lbl}
                </button>
              ))}
            </div>
            {view !== 'data' && (
              <div className="flex bg-zinc-800 border border-zinc-700 rounded-lg p-0.5 gap-0.5">
                <button onClick={() => setFilter('active')}
                  className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${filter === 'active' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
                  ✅ Active
                </button>
                <button onClick={() => setFilter('all')}
                  className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${filter === 'all' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
                  All
                </button>
              </div>
            )}
            <button onClick={() => setShowBrainDump(true)}
              className="px-3 py-2 text-sm bg-white text-zinc-900 font-bold rounded-lg hover:bg-zinc-100 transition-colors flex items-center gap-1.5">
              <span>✨</span>
              <span className="hidden sm:inline text-xs">New Offer</span>
            </button>
            <button onClick={handleSync} disabled={syncing}
              className="px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50 flex items-center gap-1.5">
              {syncing
                ? <span className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                : <span>🔄</span>}
              <span className="hidden sm:inline text-xs">Sync</span>
            </button>
          </div>
        </div>
        {syncMsg && <p className="text-xs text-emerald-400 mt-1">{syncMsg}</p>}
      </div>

      <div className="p-4 md:p-6 space-y-6">
        {/* KPIs */}
        {view !== 'data' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">🎯</div>
            <div className="text-3xl font-bold text-emerald-400">{activeOffers.length}</div>
            <div className="text-xs text-zinc-500 uppercase tracking-wide mt-1">Live Offers</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">🏷️</div>
            <div className="text-3xl font-bold text-white">{totalSales.toLocaleString()}</div>
            <div className="text-xs text-zinc-500 uppercase tracking-wide mt-1">Total Sales</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">💰</div>
            <div className="text-3xl font-bold text-emerald-400">{fmt$(totalRevenue)}</div>
            <div className="text-xs text-zinc-500 uppercase tracking-wide mt-1">All-Time Rev</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">✍️</div>
            <div className="text-3xl font-bold text-violet-400">{withMessaging}</div>
            <div className="text-xs text-zinc-500 uppercase tracking-wide mt-1">With Messaging</div>
          </div>
        </div>
        )}

        {/* Type tabs (grid + current views) */}
        {view !== 'data' && !loading && grouped.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setTypeTab('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${typeTab === 'all' ? 'bg-violet-600 text-white border-violet-500' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'}`}>
              All ({displayed.length})
            </button>
            {grouped.map(({ type, items }) => (
              <button key={type} onClick={() => setTypeTab(type)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${typeTab === type ? 'bg-violet-600 text-white border-violet-500' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'}`}>
                {type} ({items.length})
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 animate-pulse h-44" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-20 text-zinc-600">
            <div className="text-5xl mb-4">📦</div>
            <p className="text-sm">No offers yet. Hit <strong className="text-zinc-400">Sync</strong> to pull from Airtable, or <strong className="text-zinc-400">✨ New Offer</strong> to create one.</p>
          </div>
        ) : view === 'data' ? (
          <OffersData offers={effectiveOffers} />
        ) : (
          <div className="space-y-8">
            {grouped.filter(({ type }) => typeTab === 'all' || type === typeTab).map(({ type, items }) => {
              const cfg = TYPE_CONFIG[type] ?? { color: 'text-zinc-300', bg: 'bg-zinc-800', border: 'border-zinc-700' };
              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border}`}>{type}</span>
                    <span className="text-xs text-zinc-600">{items.length}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {items.map((o) => view === 'grid' ? (
                      <GridOfferCard key={o.id} offer={o} onSelect={() => setSelected(o)} />
                    ) : (
                      <OfferCard
                        key={o.id}
                        offer={o}
                        onSelect={() => setSelected(o)}
                        onDeactivate={() => void handleDeactivate(o)}
                        onDelete={() => void handleDelete(o)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <DetailPanel
          offer={selected}
          onClose={() => setSelected(null)}
          onDeactivate={() => void handleDeactivate(selected)}
          onDelete={() => void handleDelete(selected)}
        />
      )}
      {showBrainDump && (
        <BrainDumpModal
          onClose={() => setShowBrainDump(false)}
          onCreated={() => void fetchOffers()}
        />
      )}
    </div>
  );
}
