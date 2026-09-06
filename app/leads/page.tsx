'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Lead } from '@/lib/supabase-leads';
import { smsHref, waHref } from '@/lib/utils';
import { SubTabs } from '@/components/sub-tabs';
import { LeadContextPanel, saveScreenshotContext } from '@/components/LeadContext';

// ─── Stage / quality config ────────────────────────────────────────────────

const STAGE_ORDER = [
  '🔗 Pay Link Sent',
  '🔥 Hot Prospect',
  '📞 Call Booked',
  '📣 Reached Out',
  '👨 Prospect',
  '🏦 Payment Received',
];

const ARCHIVED_STAGES: string[] = [];

const ALL_STAGES = [...STAGE_ORDER];

const QUALITY_OPTIONS = ['🔥 Very High', '⭐️ High', '👌 Medium', '🤏 Low', '❌ Very Low', '🏝️ Event Lead'];

const STAGE_COLORS: Record<string, string> = {
  '🔥 Hot Prospect': 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  '📞 Call Booked': 'bg-violet-500/20 text-violet-300 border border-violet-500/30',
  '🔗 Pay Link Sent': 'bg-pink-500/20 text-pink-300 border border-pink-500/30',
  '🏦 Payment Received': 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  '👨 Prospect': 'bg-zinc-500/20 text-zinc-300 border border-zinc-500/30',
  '📣 Reached Out': 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
};

// Left-accent bar colors per stage
const STAGE_ACCENT: Record<string, string> = {
  '🔥 Hot Prospect': 'bg-orange-500',
  '📞 Call Booked': 'bg-violet-500',
  '🔗 Pay Link Sent': 'bg-pink-500',
  '🏦 Payment Received': 'bg-emerald-500',
  '👨 Prospect': 'bg-zinc-500',
  '📣 Reached Out': 'bg-blue-500',
};

// Ring colors for KPI cards when active
const STAGE_RING: Record<string, string> = {
  '🔥 Hot Prospect': 'ring-orange-500',
  '📞 Call Booked': 'ring-violet-500',
  '🔗 Pay Link Sent': 'ring-pink-500',
  '🏦 Payment Received': 'ring-emerald-500',
  '📣 Reached Out': 'ring-blue-500',
};

const QUALITY_COLORS: Record<string, string> = {
  '🔥 Very High': 'bg-green-500/20 text-green-300',
  '⭐️ High': 'bg-teal-500/20 text-teal-300',
  '👌 Medium': 'bg-yellow-500/20 text-yellow-300',
  '🤏 Low': 'bg-orange-500/20 text-orange-300',
  '❌ Very Low': 'bg-red-500/20 text-red-300',
  '🏝️ Event Lead': 'bg-blue-500/20 text-blue-300',
};

// ─── Utility helpers ────────────────────────────────────────────────────────

function cleanPhone(phone: string | null): string {
  if (!phone) return '';
  // Strip everything except digits and leading +
  return phone.replace(/[^\d+]/g, '');
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getStagePriority(stage: string | null): number {
  if (!stage) return 999;
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx !== -1) return idx;
  if (ARCHIVED_STAGES.includes(stage)) return STAGE_ORDER.length + 1;
  return STAGE_ORDER.length;
}

function groupLeadsByStage(leads: Lead[]): [string, Lead[]][] {
  const groups: Record<string, Lead[]> = {};
  for (const lead of leads) {
    const stage = lead.prospect_stage ?? 'Unknown';
    if (!groups[stage]) groups[stage] = [];
    groups[stage].push(lead);
  }
  return Object.entries(groups).sort(([a], [b]) => getStagePriority(a) - getStagePriority(b));
}

// ─── Small pure components ───────────────────────────────────────────────────

function StageBadge({ stage }: { stage: string | null }) {
  if (!stage) return null;
  const cls = STAGE_COLORS[stage] ?? 'bg-zinc-700 text-zinc-300 border border-zinc-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cls}`}>
      {stage}
    </span>
  );
}

function QualityBadge({ quality }: { quality: string | null }) {
  if (!quality) return null;
  const cls = QUALITY_COLORS[quality] ?? 'bg-zinc-700 text-zinc-300';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {quality}
    </span>
  );
}

// Inline-editable notes cell for the leads grid — saves on blur / Enter.
function NotesCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setV(value); }, [value, editing]);
  const commit = () => { setEditing(false); if (v !== value) onSave(v); };
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { setV(value); setEditing(false); e.currentTarget.blur(); }
      }}
      placeholder="Add a note…"
      title={v || undefined}
      className="w-full bg-transparent border border-transparent hover:bg-zinc-800 hover:border-zinc-700 focus:bg-zinc-800 focus:border-violet-500 rounded-lg px-2 py-1 text-xs text-zinc-300 placeholder-zinc-700 focus:outline-none truncate transition-colors"
    />
  );
}

function DaysBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-zinc-600 text-xs">—</span>;
  const color = days <= 7 ? 'text-emerald-400' : days <= 30 ? 'text-yellow-400' : 'text-red-400';
  return <span className={`text-xs font-medium ${color}`}>{days}d</span>;
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="h-11 bg-zinc-800 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

// ─── KPI card definitions ────────────────────────────────────────────────────

interface KpiCard {
  id: string;
  emoji: string;
  label: string;
  stageFilter?: string;
  timeFilter?: 'week' | 'month';
  all?: boolean;
  ringColor: string;
  numberColor: string;
}

const KPI_CARDS: KpiCard[] = [
  { id: 'hot', emoji: '🔥', label: 'Hot Prospects', stageFilter: '🔥 Hot Prospect', ringColor: 'ring-orange-500', numberColor: 'text-orange-300' },
  { id: 'call', emoji: '📞', label: 'Calls Booked', stageFilter: '📞 Call Booked', ringColor: 'ring-violet-500', numberColor: 'text-violet-300' },
  { id: 'month', emoji: '🗓️', label: 'New This Month', timeFilter: 'month', ringColor: 'ring-sky-500', numberColor: 'text-sky-300' },
  { id: 'all', emoji: '👥', label: 'Total Leads', all: true, ringColor: 'ring-zinc-400', numberColor: 'text-zinc-200' },
];

function countForCard(counts: { total: number; hot: number; call: number; month: number }, card: KpiCard): number {
  if (card.all) return counts.total;
  if (card.id === 'hot') return counts.hot;
  if (card.id === 'call') return counts.call;
  if (card.id === 'month') return counts.month;
  return 0;
}

// ─── Lead card (unified list row, matches the Calls list feel) ────────────────

const SOURCE_ICON: Record<string, string> = {
  'Facebook DM': '👥', 'Facebook Group': '👥', 'Instagram DM': '📸', 'Instagram Profile': '📸',
  'LinkedIn': '💼', 'Referral': '🤝', 'YouTube': '▶️', 'Skool': '🎓', 'Email List': '✉️',
  'Live Event': '🎪', 'Paid Trial': '🎟️', 'Webinar': '💻', 'Cold Outreach': '❄️',
};
const sourceIcon = (s: string | null) => (s ? SOURCE_ICON[s] ?? '📥' : null);

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((n) => n[0]?.toUpperCase() ?? '').join('');
}
function avatarBg(name: string) {
  const palette = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-orange-500'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return palette[h % palette.length];
}

function contactColor(days: number | null): string {
  if (days === null) return 'bg-zinc-800 border-zinc-700 text-zinc-500';
  if (days <= 2) return 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300';
  if (days <= 13) return 'bg-zinc-800 border-zinc-700 text-zinc-300';
  if (days <= 29) return 'bg-amber-950/40 border-amber-800/50 text-amber-300';
  return 'bg-rose-950/40 border-rose-800/50 text-rose-300';
}

// Days-since-last-contact chip. Tapping it marks the lead contacted today (resets to 0d).
function LastContact({ days, onReset }: { days: number | null; onReset: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onReset(); }}
      title="Mark contacted today (reset to 0 days)"
      className={`flex items-center gap-1 h-7 px-2 rounded-lg border text-xs font-medium transition-all hover:brightness-125 active:scale-95 ${contactColor(days)}`}
    >
      <span className="leading-none">🕐</span>
      <span>{days === null ? '—' : `${days}d`}</span>
      <span className="opacity-50 text-[10px] leading-none">↺</span>
    </button>
  );
}

function LeadRow({ lead, isSelected, onSelect, onCraft, onOutreach, onFollowUp, onStage, onHot, onEdit }: {
  lead: Lead;
  isSelected: boolean;
  onSelect: () => void;
  onCraft: () => void;
  onOutreach: (leadId: string, channel: string) => void;
  onFollowUp: (leadId: string, date: string | null) => void;
  onStage: (leadId: string, stage: string) => void;
  onHot: (leadId: string, next: boolean) => void;
  onEdit: (leadId: string, field: string, value: string) => void;
}) {
  const days = daysSince(lead.last_update);
  const phone = cleanPhone(lead.phone ?? '');
  const social = lead.instagram_url || lead.facebook_url || lead.social_url || lead.linkedin_url;
  const isNew = days !== null && days <= 2;
  const today = new Date().toISOString().split('T')[0];
  const fu = lead.follow_up_date;
  const fuOverdue = fu && fu < today;
  const fuToday = fu === today;

  // Single primary "message" action for the mobile row (iMessage → email → craft)
  const mobilePrimary = phone
    ? { kind: 'link' as const, href: smsHref(phone), channel: 'sms', target: undefined, icon: '💬', label: 'Message' }
    : lead.email
    ? { kind: 'link' as const, href: `mailto:${lead.email}`, channel: 'email', target: undefined, icon: '✉️', label: 'Email' }
    : { kind: 'craft' as const, icon: '✨', label: 'Craft' };

  return (
    <div className={`w-full flex items-center gap-3 sm:gap-2 px-4 py-3 sm:py-2 transition-colors group ${isSelected ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'}`}>
      {/* Avatar */}
      <button onClick={onSelect} className={`w-10 h-10 sm:w-8 sm:h-8 rounded-full ${avatarBg(lead.full_name ?? '')} flex items-center justify-center text-white font-semibold text-sm sm:text-[11px] flex-shrink-0`}>
        {initials(lead.full_name ?? '?')}
      </button>
      {/* Name + meta */}
      <button onClick={onSelect} className="min-w-0 text-left" style={{ flex: '2 1 0%' }}>
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 font-semibold sm:font-medium text-white text-[15px] sm:text-sm leading-tight break-words sm:truncate">{lead.full_name ?? '—'}</span>
          {isNew && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 flex-shrink-0">NEW</span>}
        </div>
        <p className="text-zinc-500 text-xs truncate mt-0.5">
          {lead.source ? `${sourceIcon(lead.source)} ${lead.source}` : 'no source'}
          {lead.revenue_level ? ` · 💵 ${lead.revenue_level}` : ''}
        </p>
        {/* Mobile-only stage pill under the name */}
        {lead.prospect_stage && (
          <span className={`sm:hidden inline-block mt-1.5 text-[10px] font-medium rounded-full px-2 py-0.5 ${STAGE_COLORS[lead.prospect_stage] ?? 'bg-zinc-800 text-zinc-300 border border-zinc-700'}`}>
            {lead.prospect_stage}
          </span>
        )}
      </button>
      {/* Pipeline stage — inline editable, color-coded */}
      <div className="hidden sm:block w-[150px] flex-shrink-0">
        <select
          value={lead.prospect_stage ?? ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { e.stopPropagation(); onStage(lead.id, e.target.value); }}
          className={`w-full rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-500 truncate ${STAGE_COLORS[lead.prospect_stage ?? ''] ?? 'bg-zinc-800 text-zinc-300 border border-zinc-700'}`}
        >
          {ALL_STAGES.map((s) => <option key={s} value={s} className="bg-zinc-900 text-zinc-200">{s}</option>)}
        </select>
      </div>
      {/* Quality — inline editable, color-coded */}
      <div className="hidden md:block w-[110px] flex-shrink-0">
        <select
          value={lead.quality ?? ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { e.stopPropagation(); onEdit(lead.id, 'quality', e.target.value); }}
          className={`w-full rounded-full px-2 py-1 text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-500 truncate ${QUALITY_COLORS[lead.quality ?? ''] ?? 'bg-transparent text-zinc-600 border border-transparent hover:bg-zinc-800 hover:border-zinc-700'}`}
        >
          <option value="" className="bg-zinc-900 text-zinc-400">— Quality</option>
          {QUALITY_OPTIONS.map((q) => <option key={q} value={q} className="bg-zinc-900 text-zinc-200">{q}</option>)}
        </select>
      </div>
      {/* Notes — inline editable */}
      <div className="hidden xl:block min-w-0" style={{ flex: '1.4 1 0%' }} onClick={(e) => e.stopPropagation()}>
        <NotesCell value={lead.notes ?? ''} onSave={(v) => onEdit(lead.id, 'notes', v)} />
      </div>
      {/* Follow-up date — inline editable */}
      <div className="hidden lg:block w-[130px] flex-shrink-0">
        <input
          type="date"
          value={fu ?? ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { e.stopPropagation(); onFollowUp(lead.id, e.target.value || null); }}
          className={`w-full rounded-lg px-2 py-1 text-xs cursor-pointer focus:outline-none focus:border-violet-500 border transition-colors ${
            fuOverdue ? 'bg-rose-950/40 border-rose-800/50 text-rose-300' :
            fuToday ? 'bg-amber-950/40 border-amber-800/50 text-amber-300' :
            fu ? 'bg-zinc-800 border-zinc-700 text-zinc-300' :
            'bg-transparent border-transparent hover:bg-zinc-800 hover:border-zinc-700 text-zinc-500'
          }`}
        />
      </div>
      {/* Mobile 🔥 hot toggle */}
      <button onClick={(e) => { e.stopPropagation(); onHot(lead.id, !lead.hot); }} title={lead.hot ? 'Remove from Hot' : 'Add to Hot'}
        className={`sm:hidden flex items-center justify-center w-9 h-9 rounded-lg text-base flex-shrink-0 ${lead.hot ? 'bg-orange-500/25 text-orange-400 border border-orange-500/40' : 'bg-zinc-800 text-zinc-500 border border-zinc-700/50'}`}>🔥</button>
      {/* Mobile right side — one clean tap to message them out + last-contact reset */}
      <div className="sm:hidden flex flex-col items-end gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        {mobilePrimary.kind === 'craft' ? (
          <button onClick={onCraft} className="flex items-center gap-1.5 h-10 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors">
            <span>{mobilePrimary.icon}</span>{mobilePrimary.label}
          </button>
        ) : (
          <a href={mobilePrimary.href} target={mobilePrimary.target} onClick={() => onOutreach(lead.id, mobilePrimary.channel)} className="flex items-center gap-1.5 h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors">
            <span>{mobilePrimary.icon}</span>{mobilePrimary.label}
          </a>
        )}
        <LastContact days={days} onReset={() => onOutreach(lead.id, 'manual')} />
      </div>
      {/* Last contact (desktop) — days since, click to reset to 0 */}
      <div className="hidden sm:flex w-[92px] flex-shrink-0 justify-start" onClick={(e) => e.stopPropagation()}>
        <LastContact days={days} onReset={() => onOutreach(lead.id, 'manual')} />
      </div>
      {/* Actions — fixed width so columns line up; buttons right-aligned (desktop) */}
      <div className="hidden sm:flex w-[224px] flex-shrink-0 items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => onHot(lead.id, !lead.hot)} title={lead.hot ? 'Remove from Hot' : 'Add to Hot prospects (message list)'}
          className={`flex items-center justify-center w-8 h-8 rounded-lg text-sm transition-colors ${lead.hot ? 'bg-orange-500/25 text-orange-400 border border-orange-500/40' : 'bg-zinc-800 text-zinc-500 hover:text-orange-300 border border-zinc-700/50'}`}>🔥</button>
        <button onClick={onCraft} title="Craft a message" className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-colors">✨</button>
        {phone && (
          <>
            <a href={smsHref(phone)} onClick={() => onOutreach(lead.id, 'sms')} title="iMessage" className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-800 hover:bg-blue-500/20 text-zinc-400 hover:text-blue-300 border border-zinc-700/50 transition-all text-sm">💬</a>
            <a href={waHref(phone)} target="_blank" rel="noreferrer" onClick={() => onOutreach(lead.id, 'whatsapp')} title="WhatsApp" className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-800 hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-300 border border-zinc-700/50 transition-all text-sm">📱</a>
          </>
        )}
        {lead.email && <a href={`mailto:${lead.email}`} onClick={() => onOutreach(lead.id, 'email')} title="Email" className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-800 hover:bg-violet-500/20 text-zinc-400 hover:text-violet-300 border border-zinc-700/50 transition-all text-sm">✉️</a>}
        {social && <a href={social} target="_blank" rel="noreferrer" title="Open profile" className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-800 hover:bg-pink-500/20 text-zinc-400 hover:text-pink-300 border border-zinc-700/50 transition-all text-sm">{lead.instagram_url ? '📸' : '👥'}</a>}
        {lead.ghl_contact_id && <a href={`https://app.gohighlevel.com/v2/location/ZJQSLWJWH7OVHVrJjmPj/contacts/${lead.ghl_contact_id}`} target="_blank" rel="noreferrer" onClick={() => onOutreach(lead.id, 'ghl')} title="Open in GHL" className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-600 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50 transition-all text-xs font-bold">⚡</a>}
      </div>
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────

interface ListViewProps {
  grouped: [string, Lead[]][];
  collapsedGroups: Set<string>;
  setCollapsedGroups: React.Dispatch<React.SetStateAction<Set<string>>>;
  onSelectLead: (lead: Lead) => void;
  selectedLeadId?: string;
  onInlineEdit: (id: string, field: string, value: string) => void;
  flatMode: boolean; // when a KPI filter is active, show flat list
  onOutreach: (leadId: string, channel: string) => void;
  onCraft: (lead: Lead) => void;
  onFollowUp: (leadId: string, date: string | null) => void;
  onStage: (leadId: string, stage: string) => void;
  onHot: (leadId: string, next: boolean) => void;
}

function ColumnHeader() {
  return (
    <div className="hidden sm:flex items-center gap-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
      <span className="w-8 flex-shrink-0" />
      <span style={{ flex: '2 1 0%' }}>Prospect</span>
      <span className="w-[150px] flex-shrink-0">Stage</span>
      <span className="hidden md:block w-[110px] flex-shrink-0">Quality</span>
      <span className="hidden xl:block" style={{ flex: '1.4 1 0%' }}>Notes</span>
      <span className="hidden lg:block w-[130px] flex-shrink-0">Follow-Up</span>
      <span className="w-[92px] flex-shrink-0">Contact</span>
      <span className="w-[224px] flex-shrink-0 text-right">Actions</span>
    </div>
  );
}

function ListView({ grouped, collapsedGroups, setCollapsedGroups, onSelectLead, selectedLeadId, onInlineEdit, flatMode, onOutreach, onCraft, onFollowUp, onStage, onHot }: ListViewProps) {
  const toggleGroup = (stage: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage); else next.add(stage);
      return next;
    });
  };

  const renderRows = (stageLeads: Lead[]) => (
    <div className="divide-y divide-zinc-800/50">
      {stageLeads.map((lead) => (
        <LeadRow
          key={lead.id}
          lead={lead}
          isSelected={selectedLeadId === lead.id}
          onSelect={() => onSelectLead(lead)}
          onCraft={() => onCraft(lead)}
          onOutreach={onOutreach}
          onFollowUp={onFollowUp}
          onStage={onStage}
          onHot={onHot}
          onEdit={onInlineEdit}
        />
      ))}
      {stageLeads.length === 0 && <div className="text-center py-4 text-zinc-600 text-xs">No leads</div>}
    </div>
  );

  if (flatMode) {
    const allLeads = grouped.flatMap(([, leads]) => leads);
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="border-b border-zinc-800"><ColumnHeader /></div>
        {renderRows(allLeads)}
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="border-b border-zinc-800"><ColumnHeader /></div>
      {grouped.map(([stage, stageLeads]) => {
        const isCollapsed = collapsedGroups.has(stage);
        const accent = STAGE_ACCENT[stage] ?? 'bg-zinc-600';
        return (
          <div key={stage}>
            <button
              onClick={() => toggleGroup(stage)}
              className="w-full flex items-center justify-between px-4 py-2 bg-zinc-800/40 border-y border-zinc-800/60 hover:bg-zinc-800/70 transition-colors text-left"
            >
              <div className="flex items-center gap-2.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${accent}`} />
                <span className={`transform transition-transform text-zinc-500 text-[10px] ${isCollapsed ? '' : 'rotate-90'}`}>▶</span>
                <StageBadge stage={stage} />
              </div>
              <span className="text-zinc-600 text-xs">{stageLeads.length} lead{stageLeads.length === 1 ? '' : 's'}</span>
            </button>
            {!isCollapsed && renderRows(stageLeads)}
          </div>
        );
      })}
      {grouped.length === 0 && (
        <div className="text-center py-16 text-zinc-600">No leads found</div>
      )}
    </div>
  );
}

// ─── Kanban view ──────────────────────────────────────────────────────────────

function KanbanView({
  leads,
  onSelectLead,
  onStageChange,
}: {
  leads: Lead[];
  onSelectLead: (lead: Lead) => void;
  onStageChange: (id: string, newStage: string) => void;
}) {
  const allCols = [...STAGE_ORDER, ...ARCHIVED_STAGES];
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    setDraggingId(lead.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', lead.id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setOverStage(null);
  };

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverStage(stage);
  };

  const handleDrop = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const lead = leads.find((l) => l.id === id);
    if (lead && lead.prospect_stage !== stage) {
      onStageChange(id, stage);
    }
    setDraggingId(null);
    setOverStage(null);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 320px)' }}>
      {allCols.map((stage) => {
        const stageLeads = leads.filter((l) => l.prospect_stage === stage);
        const isArchived = ARCHIVED_STAGES.includes(stage);
        if (isArchived && stageLeads.length === 0) return null;
        const isDragOver = overStage === stage;
        const accent = STAGE_ACCENT[stage] ?? 'bg-zinc-600';
        return (
          <div key={stage} className="flex-shrink-0 w-64 flex flex-col">
            <div className={`rounded-t-xl border border-b-0 px-3 py-2 flex items-center justify-between ${isArchived ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-700 bg-zinc-800/50'}`}>
              <StageBadge stage={stage} />
              <span className="text-xs text-zinc-500 ml-1 bg-zinc-700/50 px-1.5 py-0.5 rounded-full">{stageLeads.length}</span>
            </div>
            <div
              onDragOver={(e) => handleDragOver(e, stage)}
              onDragLeave={() => setOverStage(null)}
              onDrop={(e) => handleDrop(e, stage)}
              className={`flex-1 overflow-y-auto rounded-b-xl border p-2 space-y-2 transition-colors ${
                isArchived ? 'border-zinc-800 bg-zinc-900/30' : 'border-zinc-700 bg-zinc-900/50'
              } ${isDragOver ? `ring-2 ring-inset ${STAGE_RING[stage] ?? 'ring-zinc-500'} bg-zinc-800/60` : ''}`}
            >
              {isDragOver && (
                <div className={`h-1 w-full rounded-full ${accent} opacity-60 mb-1`} />
              )}
              {stageLeads.map((lead) => {
                const days = daysSince(lead.last_update);
                const isDragging = draggingId === lead.id;
                return (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead)}
                    onDragEnd={handleDragEnd}
                    onClick={() => !isDragging && onSelectLead(lead)}
                    className={`rounded-lg p-3 border transition-all select-none ${
                      isDragging
                        ? 'opacity-40 border-zinc-600 bg-zinc-800 cursor-grabbing scale-95'
                        : 'bg-zinc-800 hover:bg-zinc-700 cursor-grab border-zinc-700/50 hover:border-zinc-600 hover:shadow-md'
                    }`}
                  >
                    <div className="font-medium text-sm text-zinc-100 truncate">{lead.full_name ?? '—'}</div>
                    {lead.phone && (
                      <div className="text-xs text-blue-400 mt-0.5 truncate">{lead.phone}</div>
                    )}
                    {lead.quality && (
                      <div className="mt-1.5"><QualityBadge quality={lead.quality} /></div>
                    )}
                    {lead.notes && (
                      <div className="text-xs text-zinc-500 mt-1.5 line-clamp-2">
                        {lead.notes.slice(0, 60)}{lead.notes.length > 60 ? '...' : ''}
                      </div>
                    )}
                    {days !== null && (
                      <div className="mt-1.5"><DaysBadge days={days} /></div>
                    )}
                  </div>
                );
              })}
              {stageLeads.length === 0 && !isDragOver && (
                <div className="text-center py-4 text-zinc-600 text-xs">Empty</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Team member picker ──────────────────────────────────────────────────────

interface TeamMember { id: string; name: string; role: string; }

interface TeamPickerProps {
  label: string;
  role: 'setter' | 'salesperson';
  value: string | null;
  members: TeamMember[];
  onSelect: (name: string) => void;
  onAddMember: (name: string, role: string) => Promise<void>;
}

function TeamPicker({ label, role, value, members, onSelect, onAddMember }: TeamPickerProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const eligible = members.filter((m) => m.role === role || m.role === 'both');

  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    await onAddMember(trimmed, role);
    onSelect(trimmed);
    setNewName('');
    setAdding(false);
    setSaving(false);
  };

  return (
    <div className="grid grid-cols-2 gap-2 items-start">
      <span className="text-zinc-500 text-xs uppercase tracking-wide pt-2">{label}</span>
      <div className="space-y-1.5">
        <div className="flex gap-1.5">
          <select
            value={value ?? ''}
            onChange={(e) => onSelect(e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">— none —</option>
            {eligible.map((m) => (
              <option key={m.id} value={m.name}>{m.name}</option>
            ))}
          </select>
          <button
            onClick={() => setAdding((v) => !v)}
            title="Add new person"
            className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border text-sm transition-colors ${
              adding ? 'bg-zinc-700 border-zinc-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
            }`}
          >
            {adding ? '×' : '+'}
          </button>
        </div>
        {adding && (
          <div className="flex gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
              placeholder="Full name…"
              className="flex-1 bg-zinc-800 border border-blue-500/50 rounded-lg px-2 py-1.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleAdd}
              disabled={saving || !newName.trim()}
              className="flex-shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-xs font-semibold text-white transition-colors"
            >
              {saving ? '…' : 'Add'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Source options ──────────────────────────────────────────────────────────

const SOURCE_OPTIONS = [
  'Facebook Group',
  'Facebook DM',
  'Instagram DM',
  'Instagram Profile',
  'LinkedIn',
  'Referral',
  'YouTube',
  'Skool',
  'Email List',
  'Live Event',
  'Paid Trial',
  'Webinar',
  'Cold Outreach',
  'Other',
];

// ─── Add Lead Modal ──────────────────────────────────────────────────────────

interface GhlContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
}

interface ScreenshotResult {
  name: string;
  ghl: GhlContact | null;
}

interface AddLeadModalProps {
  onClose: () => void;
  onCreated: (lead: Lead, openContext?: boolean) => void;
}

// Route a pasted social link to the right column based on its domain
function routeSocial(url: string): {
  instagram_url?: string; facebook_url?: string; linkedin_url?: string; social_url?: string;
} {
  if (!url) return {};
  const u = url.toLowerCase();
  if (u.includes('instagram.com')) return { instagram_url: url };
  if (u.includes('facebook.com') || u.includes('fb.com')) return { facebook_url: url };
  if (u.includes('linkedin.com')) return { linkedin_url: url };
  return { social_url: url };
}

function AddLeadModal({ onClose, onCreated }: AddLeadModalProps) {
  const [tab, setTab] = useState<'manual' | 'screenshot'>('manual');

  // Manual form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [stage, setStage] = useState('👨 Prospect');
  const [quality, setQuality] = useState('');
  const [source, setSource] = useState('');
  const [social, setSocial] = useState('');
  const [revenueLevel, setRevenueLevel] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Optional conversation screenshot attached at creation time
  const [ctxFile, setCtxFile] = useState<File | null>(null);
  const [ctxPreview, setCtxPreview] = useState<string | null>(null);
  const [ctxStatus, setCtxStatus] = useState<string | null>(null);
  const ctxInputRef = useRef<HTMLInputElement>(null);

  // GHL search state
  const [ghlQuery, setGhlQuery] = useState('');
  const [ghlSearching, setGhlSearching] = useState(false);
  const [ghlResults, setGhlResults] = useState<GhlContact[] | null>(null);
  const [ghlFilled, setGhlFilled] = useState(false);
  const [selectedGhlId, setSelectedGhlId] = useState<string | null>(null);

  // Screenshot state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState('image/png');
  const [extracting, setExtracting] = useState(false);
  const [screenshotResults, setScreenshotResults] = useState<ScreenshotResult[] | null>(null);
  const [importingIdx, setImportingIdx] = useState<Set<number>>(new Set());
  const [importedIdx, setImportedIdx] = useState<Set<number>>(new Set());
  const [importErrors, setImportErrors] = useState<Record<number, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleGhlSearch = useCallback(async (query?: string) => {
    const q = (query ?? ghlQuery ?? name).trim();
    if (!q) return;
    setGhlSearching(true);
    setGhlResults(null);
    try {
      const res = await fetch(`/api/leads/add?q=${encodeURIComponent(q)}`);
      const data = await res.json() as { contacts: GhlContact[] };
      setGhlResults(data.contacts ?? []);
    } catch {
      setGhlResults([]);
    } finally {
      setGhlSearching(false);
    }
  }, [ghlQuery, name]);

  // Auto-search GoHighLevel as the user types (debounced) — no button press needed
  useEffect(() => {
    const q = ghlQuery.trim();
    if (q.length < 2) { setGhlResults(null); return; }
    const t = setTimeout(() => { void handleGhlSearch(q); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghlQuery]);

  const fillFromGhl = (contact: GhlContact) => {
    if (contact.name && !name) setName(contact.name);
    if (contact.email) setEmail(contact.email);
    if (contact.phone) setPhone(contact.phone);
    setSelectedGhlId(contact.id);
    setGhlFilled(true);
    setGhlResults(null);
  };

  const handleSave = async () => {
    if (!name.trim()) { setSaveError('Name is required'); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          prospect_stage: stage,
          quality: quality || undefined,
          source: source || undefined,
          notes: notes.trim() || undefined,
          ghl_contact_id: selectedGhlId ?? undefined,
          revenue_level: revenueLevel.trim() || undefined,
          follow_up_date: followUpDate || undefined,
          ...routeSocial(social.trim()),
        }),
      });
      const data = await res.json() as { lead?: Lead; error?: string };
      if (data.error) throw new Error(data.error);
      if (data.lead) {
        // If a conversation screenshot was attached, read it and save the context on this person
        if (ctxFile) {
          setCtxStatus('Reading the conversation…');
          try {
            await saveScreenshotContext(data.lead.id, ctxFile);
          } catch {
            setCtxStatus(null);
          }
        }
        onCreated(data.lead, !!ctxFile);
      }
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
      setCtxStatus(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageMime(file.type || 'image/png');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setImagePreview(result);
      // Strip the data URL prefix to get raw base64
      const base64 = result.split(',')[1];
      setImageData(base64 ?? null);
      setScreenshotResults(null);
    };
    reader.readAsDataURL(file);
  };

  const handleExtract = async () => {
    if (!imageData) return;
    setExtracting(true);
    setScreenshotResults(null);
    try {
      const res = await fetch('/api/leads/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData, mimeType: imageMime }),
      });
      const data = await res.json() as { results: ScreenshotResult[]; error?: string };
      if (data.error) throw new Error(data.error);
      setScreenshotResults(data.results ?? []);
    } catch (err) {
      setScreenshotResults([]);
    } finally {
      setExtracting(false);
    }
  };

  const importScreenshotLead = async (result: ScreenshotResult, idx: number) => {
    setImportingIdx((prev) => new Set(prev).add(idx));
    setImportErrors((prev) => { const n = { ...prev }; delete n[idx]; return n; });
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: result.ghl?.name || result.name,
          email: result.ghl?.email ?? undefined,
          phone: result.ghl?.phone ?? undefined,
          prospect_stage: '👨 Prospect',
          ghl_contact_id: result.ghl?.id ?? undefined,
        }),
      });
      const data = await res.json() as { lead?: Lead; error?: string };
      if (data.error) throw new Error(data.error);
      if (!data.lead) throw new Error('No lead returned');
      onCreated(data.lead);
      setImportedIdx((prev) => new Set(prev).add(idx));
    } catch (err) {
      setImportErrors((prev) => ({ ...prev, [idx]: err instanceof Error ? err.message : 'Save failed' }));
    } finally {
      setImportingIdx((prev) => { const s = new Set(prev); s.delete(idx); return s; });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700 flex-shrink-0">
          <h2 className="text-lg font-bold text-white">➕ Add Lead</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl leading-none p-1">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-700 flex-shrink-0">
          {(['manual', 'screenshot'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t ? 'text-white border-b-2 border-blue-500' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t === 'manual' ? '✏️ Manual Entry' : '📸 Screenshot Import'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── MANUAL TAB ── */}
          {tab === 'manual' && (
            <div className="space-y-4">
              {/* GHL Search */}
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-3 space-y-2">
                <div className="text-xs text-zinc-400 font-medium uppercase tracking-wide">🔍 Find in GoHighLevel</div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Start typing a name, email, or phone…"
                    value={ghlQuery}
                    onChange={(e) => setGhlQuery(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-600 rounded-lg pl-3 pr-9 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {ghlSearching && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-block w-4 h-4 border-2 border-zinc-500 border-t-blue-400 rounded-full animate-spin" />
                  )}
                </div>
                {ghlFilled && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <span>✓</span> Filled from GHL
                    <button onClick={() => setGhlFilled(false)} className="text-zinc-500 hover:text-zinc-300 ml-1">clear</button>
                  </div>
                )}
                {ghlResults !== null && (
                  <div className="space-y-1.5 mt-1">
                    {ghlResults.length === 0 ? (
                      <div className="text-xs text-zinc-500 text-center py-2">No contacts found in GHL</div>
                    ) : (
                      ghlResults.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => fillFromGhl(c)}
                          className="w-full text-left px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-lg transition-colors"
                        >
                          <div className="text-sm font-medium text-zinc-100">{c.name}</div>
                          <div className="text-xs text-zinc-400 mt-0.5">
                            {[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact info'}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Form fields */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-400 uppercase tracking-wide block mb-1">Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-zinc-400 uppercase tracking-wide block mb-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 uppercase tracking-wide block mb-1">Phone</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 555 000 0000"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-zinc-400 uppercase tracking-wide block mb-1">Pipeline Stage</label>
                    <select
                      value={stage}
                      onChange={(e) => setStage(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {ALL_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 uppercase tracking-wide block mb-1">Quality</label>
                    <select
                      value={quality}
                      onChange={(e) => setQuality(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">— select —</option>
                      {QUALITY_OPTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 uppercase tracking-wide block mb-1">Source</label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">— select source —</option>
                    {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 uppercase tracking-wide block mb-1">Social media link</label>
                  <input
                    type="url"
                    value={social}
                    onChange={(e) => setSocial(e.target.value)}
                    placeholder="Instagram, Facebook, LinkedIn, or any profile URL"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-zinc-600 mt-1">Auto-detects the platform so the right icon shows on the lead.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-zinc-400 uppercase tracking-wide block mb-1">Revenue level</label>
                    <input
                      type="text"
                      value={revenueLevel}
                      onChange={(e) => setRevenueLevel(e.target.value)}
                      placeholder="e.g. $10k/mo"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 uppercase tracking-wide block mb-1">Follow-up date</label>
                    <input
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 uppercase tracking-wide block mb-1">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Any notes about this lead…"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  />
                </div>
              </div>

              {saveError && (
                <div className="text-red-400 text-sm bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">
                  {saveError}
                </div>
              )}

              {/* Conversation screenshot — saves context on this person */}
              <div className="pt-1">
                <label className="text-xs text-zinc-400 uppercase tracking-wide block mb-1">📸 Conversation screenshot (optional)</label>
                <input
                  ref={ctxInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setCtxFile(f);
                    const r = new FileReader();
                    r.onload = (ev) => setCtxPreview(ev.target?.result as string);
                    r.readAsDataURL(f);
                  }}
                />
                <button
                  onClick={() => ctxInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-zinc-700 hover:border-violet-500/60 rounded-xl p-4 text-center transition-colors"
                >
                  {ctxPreview ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={ctxPreview} alt="Conversation preview" className="max-h-36 mx-auto rounded-lg border border-zinc-800" />
                  ) : (
                    <>
                      <p className="text-zinc-300 text-xs font-medium">Attach a DM/chat screenshot</p>
                      <p className="text-zinc-600 text-[11px] mt-0.5">I&apos;ll read it and save what to say next on this person</p>
                    </>
                  )}
                </button>
                {ctxPreview && (
                  <button onClick={() => { setCtxFile(null); setCtxPreview(null); if (ctxInputRef.current) ctxInputRef.current.value = ''; }}
                    className="mt-1.5 text-[11px] text-zinc-500 hover:text-zinc-300">Remove screenshot</button>
                )}
              </div>

              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-semibold transition-colors"
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {ctxStatus ?? 'Saving…'}
                  </span>
                ) : ctxFile ? '➕ Add Lead & read the conversation' : '➕ Add Lead'}
              </button>
            </div>
          )}

          {/* ── SCREENSHOT TAB ── */}
          {tab === 'screenshot' && (
            <div className="space-y-4">
              <p className="text-xs text-zinc-400 leading-relaxed">
                Upload a screenshot of a contact list, Facebook group members, Instagram followers, or any list of names.
                Claude AI will extract the names and look each one up in GoHighLevel automatically.
              </p>

              {/* Upload area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  imagePreview ? 'border-blue-500/50 bg-blue-500/5' : 'border-zinc-700 hover:border-zinc-500'
                }`}
              >
                {imagePreview ? (
                  <div className="space-y-2">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-h-40 mx-auto rounded-lg object-contain"
                    />
                    <div className="text-xs text-zinc-400">Click to change image</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-3xl">📸</div>
                    <div className="text-sm font-medium text-zinc-300">Click to upload screenshot</div>
                    <div className="text-xs text-zinc-500">PNG, JPG, WebP supported</div>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              {imageData && (
                <button
                  onClick={handleExtract}
                  disabled={extracting}
                  className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 rounded-xl text-sm font-semibold transition-all"
                >
                  {extracting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Extracting names…
                    </span>
                  ) : '🤖 Extract Names & Find in GHL'}
                </button>
              )}

              {/* Results */}
              {screenshotResults !== null && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-zinc-400 uppercase tracking-wide font-medium">
                      {screenshotResults.length} {screenshotResults.length === 1 ? 'person' : 'people'} found
                    </div>
                    {screenshotResults.length > 0 && (
                      <button
                        onClick={async () => {
                          for (let i = 0; i < screenshotResults.length; i++) {
                            if (!importedIdx.has(i)) {
                              await importScreenshotLead(screenshotResults[i], i);
                            }
                          }
                        }}
                        className="text-xs px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 rounded-lg text-emerald-300 font-medium transition-colors"
                      >
                        Import All
                      </button>
                    )}
                  </div>
                  {screenshotResults.length === 0 && (
                    <div className="text-center py-4 text-zinc-500 text-sm">No names could be extracted from this image.</div>
                  )}
                  {screenshotResults.map((result, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                        importedIdx.has(idx)
                          ? 'border-emerald-600/30 bg-emerald-900/10'
                          : 'border-zinc-700 bg-zinc-800/50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-100 truncate">
                          {result.ghl?.name || result.name}
                        </div>
                        {result.ghl ? (
                          <div className="text-xs text-zinc-400 truncate mt-0.5">
                            {[result.ghl.email, result.ghl.phone].filter(Boolean).join(' · ')}
                            <span className="ml-1.5 text-emerald-400 text-[10px]">✓ found in GHL</span>
                          </div>
                        ) : (
                          <div className="text-xs text-zinc-500 mt-0.5">Not found in GHL</div>
                        )}
                      </div>
                      {importedIdx.has(idx) ? (
                        <span className="text-emerald-400 text-xs font-medium flex-shrink-0">✓ Saved</span>
                      ) : importErrors[idx] ? (
                        <span className="text-red-400 text-xs flex-shrink-0" title={importErrors[idx]}>✗ Failed</span>
                      ) : (
                        <button
                          onClick={() => void importScreenshotLead(result, idx)}
                          disabled={importingIdx.has(idx)}
                          className="flex-shrink-0 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 rounded-lg text-xs font-medium text-blue-300 disabled:opacity-50 transition-colors"
                        >
                          {importingIdx.has(idx) ? (
                            <span className="inline-block w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                          ) : 'Add'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DM Conversation Stages (from the Setter SOP) ─────────────────────────────

const DM_STAGES: { key: string; emoji: string; label: string; scriptCategory: string; nextMove: string }[] = [
  { key: '👋 Opening',    emoji: '👋', label: 'Opening',    scriptCategory: 'opening',    nextMove: 'Start the conversation. Value first, zero pitch. Get a reply, build rapport.' },
  { key: '🔍 Probing',    emoji: '🔍', label: 'Probing',    scriptCategory: 'probing',    nextMove: 'Ask permission, then 2-3 probing questions: current situation → desired → bottleneck → urgency.' },
  { key: '🎯 Transition', emoji: '🎯', label: 'Transition', scriptCategory: 'transition', nextMove: 'They\'re hot. Run the 3-step transition: permission → no-brainer → make the NO a YES. Call first, $47 trial as fallback.' },
  { key: '📅 Booking',    emoji: '📅', label: 'Booking',    scriptCategory: 'booking',    nextMove: 'Offer 2 concrete times. Then double-confirm: "any reason you might have to cancel?"' },
  { key: '✅ Confirmed',  emoji: '✅', label: 'Confirmed',  scriptCategory: 'booking',    nextMove: 'Send pre-call homework + resources. Check in 24-48h before the call. Warm = +10-20% close rate.' },
];

// ─── Connect Next queue ───────────────────────────────────────────────────────
// Who to reach out to right now, per the SOP cadence (24h → 48h → 72h → 1wk → final CTA)

interface QueueLead {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  prospect_stage: string | null;
  quality: string | null;
  source: string | null;
  ghl_url: string | null;
  ghl_contact_id: string | null;
  social_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  touches: number;
  reengage?: boolean;
  scheduledDue?: boolean;
  follow_up_date?: string | null;
  hoursSince: number;
  finalCta: boolean;
}

function socialLink(l: QueueLead): { url: string; label: string } | null {
  if (l.instagram_url) return { url: l.instagram_url, label: '📸 Instagram' };
  if (l.facebook_url) return { url: l.facebook_url, label: '👥 Facebook' };
  if (l.social_url) {
    if (/instagram/i.test(l.social_url)) return { url: l.social_url, label: '📸 Instagram' };
    if (/facebook/i.test(l.social_url)) return { url: l.social_url, label: '👥 Facebook' };
    if (/linkedin/i.test(l.social_url)) return { url: l.social_url, label: '💼 LinkedIn' };
    return { url: l.social_url, label: '🌐 Social' };
  }
  if (l.linkedin_url) return { url: l.linkedin_url, label: '💼 LinkedIn' };
  return null;
}

// Fallback cadence if the Scripts library hasn't loaded
const TOUCH_SCRIPTS: { label: string; script: (name: string) => string }[] = [
  { label: '1st touch — open the conversation', script: (n) => `Hey ${n}! Been thinking about you... how's everything going on your end?` },
  { label: '2nd touch (24h) — crazy idea', script: (n) => `Hey ${n}, I have a crazy idea... do you have 10 minutes today?` },
  { label: '3rd touch (48h) — light re-ping', script: () => `👀 (or send a GIF, keep it light)` },
  { label: '4th touch (72h) — check in', script: (n) => `You okay ${n}?` },
  { label: '5th touch (1 week) — do you still want it', script: (n) => `Hey ${n}, do you still want [RESULT], or should I stop reaching out?` },
  { label: 'Final CTA — last message before removing', script: (n) => `${n}, how would you like to proceed from here?` },
];

type CadenceScript = { title: string; body: string };

function useScriptLibrary(): { cadence: CadenceScript[] | null; reopeners: CadenceScript[] | null } {
  const [cadence, setCadence] = useState<CadenceScript[] | null>(null);
  const [reopeners, setReopeners] = useState<CadenceScript[] | null>(null);
  useEffect(() => {
    fetch('/api/scripts')
      .then((r) => r.json())
      .then((d: { scripts?: { category: string; title: string; body: string }[] }) => {
        const all = d.scripts ?? [];
        const c = all.filter((s) => s.category === 'cadence');
        const r = all.filter((s) => s.category === 'reopener');
        if (c.length) setCadence(c.map((s) => ({ title: s.title, body: s.body })));
        if (r.length) setReopeners(r.map((s) => ({ title: s.title, body: s.body })));
      })
      .catch(() => {});
  }, []);
  return { cadence, reopeners };
}

// Pick the right script: leads already in conversation get a re-opener,
// leads with logged touches follow the cadence, true fresh leads get the opener.
function pickScript(
  l: { touches: number; reengage?: boolean; id: string },
  cadence: CadenceScript[] | null,
  reopeners: CadenceScript[] | null,
  first: string,
  fallbackIdx: number,
): { label: string; text: string } {
  const fill = (s: CadenceScript) => ({ label: s.title, text: s.body.replaceAll('{name}', first) });
  // Re-engagement with no logged touch history → rotate through the re-opener library
  if (l.touches === 0 && l.reengage && reopeners?.length) {
    return fill(reopeners[fallbackIdx % reopeners.length]);
  }
  if (cadence?.length) {
    return fill(cadence[Math.min(l.touches, cadence.length - 1)]);
  }
  const idx = Math.min(l.touches, TOUCH_SCRIPTS.length - 1);
  return { label: TOUCH_SCRIPTS[idx].label, text: TOUCH_SCRIPTS[idx].script(first) };
}

function ConnectNextQueue({ onOpenLead }: { onOpenLead: (leadId: string) => void }) {
  const [queue, setQueue] = useState<QueueLead[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sendError, setSendError] = useState<string | null>(null);
  const { cadence, reopeners } = useScriptLibrary();

  async function sendViaGhl(l: QueueLead, message: string) {
    if (!l.ghl_contact_id) return;
    setSendingId(l.id);
    setSendError(null);
    try {
      const res = await fetch(`/api/leads/${l.id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'sms', message, contactId: l.ghl_contact_id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Send failed');
      }
      setSentIds((prev) => new Set(prev).add(l.id));
      await fetch('/api/outreaches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: l.id, channel: 'ghl' }),
      });
      // brief ✓ Sent state, then drop off the queue
      setTimeout(() => setTouched((prev) => new Set(prev).add(l.id)), 1200);
    } catch (e) {
      setSendError(`${l.full_name}: ${e instanceof Error ? e.message : 'send failed'}`);
    } finally {
      setSendingId(null);
    }
  }

  useEffect(() => {
    fetch('/api/today')
      .then((r) => r.json())
      .then((d: { queue?: QueueLead[] }) => { setQueue(d.queue ?? []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const visible = queue.filter((l) => !touched.has(l.id));
  const shown = expanded ? visible.slice(0, 15) : visible.slice(0, 5);

  async function logTouch(id: string) {
    setTouched((prev) => new Set(prev).add(id));
    await fetch('/api/outreaches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: id, channel: 'dm' }),
    });
  }

  function copyScript(id: string, text: string) {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  if (!loaded) return <p className="text-zinc-600 text-sm text-center py-10 animate-pulse">Loading your queue…</p>;
  if (visible.length === 0) return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl py-12 text-center">
      <p className="text-3xl mb-2">🎉</p>
      <p className="text-white text-sm font-semibold">You&apos;re all caught up</p>
      <p className="text-zinc-500 text-xs mt-1">No one is due for a touch right now. Go start new conversations.</p>
    </div>
  );

  return (
    <div className="bg-gradient-to-br from-orange-950/30 to-zinc-900 border border-orange-800/40 rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-orange-800/30 flex items-center justify-between">
        <div>
          <p className="text-white font-bold text-sm">🔥 Connect Next</p>
          <p className="text-zinc-500 text-xs mt-0.5">Due for a touch per your cadence — hot first. Tap the script, send it, log it.</p>
        </div>
        <span className="text-orange-300 text-xs font-semibold bg-orange-500/20 border border-orange-500/30 rounded-full px-2.5 py-1">{visible.length} due</span>
      </div>
      {sendError && <p className="px-5 py-2 text-xs text-rose-400 bg-rose-950/30 border-b border-rose-900/30">⚠️ {sendError}</p>}
      <div className="divide-y divide-zinc-800/50">
        {shown.map((l, rowIdx) => {
          const first = (l.full_name ?? '').split(' ')[0] || 'there';
          const { label, text } = pickScript(l, cadence, reopeners, first, rowIdx);
          return (
            <div key={l.id} className="px-5 py-3.5">
              <button onClick={() => onOpenLead(l.id)} className="w-full text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white text-sm font-semibold">{l.full_name ?? 'Unknown'}</p>
                  <span className="text-xs text-zinc-500">{l.prospect_stage}</span>
                  {l.quality?.includes('Very High') && <span className="text-xs">🔥</span>}
                  {l.finalCta && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">FINAL CTA</span>}
                  {l.scheduledDue && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">📌 SCHEDULED{l.follow_up_date && l.follow_up_date < new Date().toISOString().split('T')[0] ? ' · OVERDUE' : ''}</span>}
                  <span className="ml-auto text-zinc-600 text-[10px]">{l.touches} touch{l.touches === 1 ? '' : 'es'} · {l.hoursSince > 24 * 90 ? 'never contacted' : l.hoursSince < 24 ? `${l.hoursSince}h ago` : `${Math.floor(l.hoursSince / 24)}d ago`}</span>
                </div>
              </button>
              <button
                onClick={() => copyScript(l.id, text)}
                className="w-full text-left bg-zinc-950/60 border border-zinc-800 hover:border-zinc-600 rounded-xl px-3 py-2 mt-2 transition-colors"
              >
                <p className="text-zinc-600 text-[10px] uppercase tracking-wide mb-0.5">{label} — tap to copy</p>
                <p className="text-zinc-300 text-xs">{copiedId === l.id ? '✓ Copied!' : text}</p>
              </button>
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {l.ghl_contact_id && (
                  <button
                    onClick={() => void sendViaGhl(l, text)}
                    disabled={sendingId === l.id || sentIds.has(l.id)}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition-colors ${sentIds.has(l.id) ? 'bg-emerald-600/30 border-emerald-600/40 text-emerald-300' : 'bg-violet-600 hover:bg-violet-500 border-violet-500 text-white shadow shadow-violet-500/20'}`}
                  >
                    {sentIds.has(l.id) ? '✓ Sent' : sendingId === l.id ? 'Sending…' : '⚡ Send via GHL'}
                  </button>
                )}
                {(() => { const s = socialLink(l); return s ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="px-2 py-1 rounded-lg bg-pink-600/20 hover:bg-pink-600/40 border border-pink-600/30 text-pink-300 text-xs font-medium transition-colors">{s.label}</a>
                ) : null; })()}
                {l.ghl_url && <a href={l.ghl_url} target="_blank" rel="noreferrer" onClick={() => void logTouch(l.id)} className="px-2 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 border border-violet-600/30 text-violet-300 text-xs font-medium transition-colors">⚡ GHL</a>}
                {l.phone && (
                  <>
                    <a href={smsHref(l.phone, text)} onClick={() => void logTouch(l.id)} className="px-2 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/30 text-blue-300 text-xs font-medium transition-colors">💬 iMessage</a>
                    <a href={waHref(l.phone, text)} target="_blank" rel="noreferrer" onClick={() => void logTouch(l.id)} className="px-2 py-1 rounded-lg bg-green-600/20 hover:bg-green-600/40 border border-green-600/30 text-green-300 text-xs font-medium transition-colors">📱 WhatsApp</a>
                    <a href={`tel:${l.phone}`} onClick={() => void logTouch(l.id)} className="px-2 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/30 text-emerald-300 text-xs font-medium transition-colors">📞</a>
                  </>
                )}
                {l.email && <a href={`mailto:${l.email}`} onClick={() => void logTouch(l.id)} className="px-2 py-1 rounded-lg bg-zinc-700/40 hover:bg-zinc-700 border border-zinc-600/40 text-zinc-300 text-xs font-medium transition-colors">✉️ Email</a>}
                <button onClick={() => void logTouch(l.id)} className="ml-auto px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/30 text-emerald-300 text-xs font-semibold transition-colors">✓ Log Touch</button>
              </div>
            </div>
          );
        })}
      </div>
      {visible.length > 5 && (
        <button onClick={() => setExpanded((v) => !v)} className="w-full py-2.5 text-xs text-zinc-500 hover:text-white border-t border-zinc-800/50 transition-colors">
          {expanded ? '↑ Show less' : `↓ Show ${Math.min(visible.length - 5, 10)} more`}
        </button>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpiCounts, setKpiCounts] = useState<{ total: number; hot: number; call: number; month: number }>({ total: 0, hot: 0, call: 0, month: 0 });
  const [outreachStats, setOutreachStats] = useState<{ today: number; this_month: number; avg_per_day: number }>({ today: 0, this_month: 0, avg_per_day: 0 });
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Filter state
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState('');
  const [qualityFilter, setQualityFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  // View state
  const [mainTab, setMainTab] = useState<'leads' | 'followup' | 'data'>('leads');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showRecent, setShowRecent] = useState(false);

  // Slide-out panel state
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [offerBriefs, setOfferBriefs] = useState<{ id: string; name: string; emoji: string }[]>([]);
  const [panelTab, setPanelTab] = useState<'connect' | 'info' | 'context' | 'message' | 'notes' | 'ai'>('info');

  // Referral Party — add this lead to the next party's calendar invite (only the next one)
  const [party, setParty] = useState<{ date: string; label: string } | null>(null);
  const [partyInvite, setPartyInvite] = useState<{ status: string } | null>(null);
  const [partyBusy, setPartyBusy] = useState(false);
  const [partyErr, setPartyErr] = useState<string | null>(null);
  useEffect(() => {
    setPartyInvite(null); setPartyErr(null);
    if (!selectedLead) return;
    const q = selectedLead.email ? `?email=${encodeURIComponent(selectedLead.email)}` : '';
    fetch(`/api/leads/referral-party${q}`).then((r) => r.json())
      .then((d) => { setParty(d.party ?? null); setPartyInvite(d.invite ?? null); })
      .catch(() => {});
  }, [selectedLead]);
  async function inviteToParty() {
    if (!selectedLead) return;
    setPartyBusy(true); setPartyErr(null);
    try {
      const d = await (await fetch('/api/leads/referral-party', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lead_id: selectedLead.id, name: selectedLead.full_name, email: selectedLead.email }),
      })).json();
      if (d.error) setPartyErr(d.error);
      else { setParty(d.party ?? party); setPartyInvite(d.invite ?? { status: 'queued' }); }
    } catch { setPartyErr("Couldn't add them. Try again."); } finally { setPartyBusy(false); }
  }
  useEffect(() => { fetch('/api/offer-briefs').then((r) => r.json()).then((d) => setOfferBriefs(Array.isArray(d) ? d.map((o: { id: string; name: string; emoji: string }) => ({ id: o.id, name: o.name, emoji: o.emoji })) : [])).catch(() => {}); }, []);

  // Connect tab state
  const [ctxText, setCtxText] = useState('');
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const [crafting, setCrafting] = useState(false);
  const [craftResult, setCraftResult] = useState<{ message: string; why: string; alt: string } | null>(null);
  const [craftError, setCraftError] = useState<string | null>(null);
  const [craftCopied, setCraftCopied] = useState<string | null>(null);
  const [craftSending, setCraftSending] = useState(false);
  const [craftSent, setCraftSent] = useState(false);
  type Intel = {
    calls: { id: string; call_date: string | null; result: string | null; offer: string | null; deal_amount: number | null; objections: string[] | null; follow_up_notes: string | null; ai_summary: string | null }[];
    payments: { id: string; amount: number; payment_date: string | null; offer: string | null; status: string; payment_type: string }[];
  };
  const [intel, setIntel] = useState<Intel | null>(null);

  // Load intel + reset connect state when the panel opens on a new lead
  useEffect(() => {
    if (!selectedLead) return;
    setCtxText(''); setCraftResult(null); setCraftError(null); setCraftSent(false); setIntel(null);
    fetch(`/api/leads/${selectedLead.id}/craft`)
      .then((r) => r.json())
      .then((d: Intel & { error?: string }) => { if (!d.error) setIntel({ calls: d.calls ?? [], payments: d.payments ?? [] }); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLead?.id]);

  // Open a lead's panel directly when arriving from another page (e.g. Home → /leads?lead=<id>)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('lead');
    if (!id) return;
    fetch(`/api/leads/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) { setSelectedLead(d as Lead); setPanelTab('info'); } })
      .catch(() => {});
  }, []);

  function toggleRecording() {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => { continuous: boolean; interimResults: boolean; lang: string; onresult: (e: { resultIndex: number; results: { [i: number]: { isFinal: boolean; 0: { transcript: string } }; length: number } }) => void; onend: () => void; start: () => void; stop: () => void }; SpeechRecognition?: new () => never }).webkitSpeechRecognition;
    if (!SR) { setCraftError('Voice input needs Chrome or Safari'); return; }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
      }
      if (final) setCtxText((prev) => (prev ? `${prev} ${final.trim()}` : final.trim()));
    };
    rec.onend = () => setRecording(false);
    recognitionRef.current = rec;
    rec.start();
    setRecording(true);
  }

  // Full script library for the stage tracker
  const [allScripts, setAllScripts] = useState<{ category: string; title: string; body: string }[]>([]);
  useEffect(() => {
    fetch('/api/scripts')
      .then((r) => r.json())
      .then((d: { scripts?: { category: string; title: string; body: string }[] }) => setAllScripts(d.scripts ?? []))
      .catch(() => {});
  }, []);
  const [stageScriptsOpen, setStageScriptsOpen] = useState(true);
  const [quickDraw, setQuickDraw] = useState<string | null>(null);

  async function setFollowUpDate(date: string | null) {
    if (!selectedLead) return;
    setSelectedLead({ ...selectedLead, follow_up_date: date });
    setLeads((prev) => prev.map((l) => (l.id === selectedLead.id ? { ...l, follow_up_date: date } : l)));
    await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedLead.id, follow_up_date: date }),
    });
  }

  async function setDmStage(stage: string) {
    if (!selectedLead) return;
    const next = selectedLead.dm_stage === stage ? null : stage;
    setSelectedLead({ ...selectedLead, dm_stage: next });
    setLeads((prev) => prev.map((l) => (l.id === selectedLead.id ? { ...l, dm_stage: next } : l)));
    await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedLead.id, dm_stage: next }),
    });
  }

  const [savingCtx, setSavingCtx] = useState(false);
  async function saveCtxNote() {
    if (!selectedLead || !ctxText.trim()) return;
    setSavingCtx(true);
    try {
      const res = await fetch(`/api/leads/${selectedLead.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ctxText.trim() }),
      });
      const json = await res.json() as { note?: LeadNote };
      if (json.note) setNotes((prev) => [json.note!, ...prev]);
      setCtxText('');
    } finally {
      setSavingCtx(false);
    }
  }

  // Open a lead straight into the Connect tab and auto-run the craft
  const [autoCraft, setAutoCraft] = useState(false);
  function openAndCraft(lead: Lead) {
    setSelectedLead(lead);
    setPanelTab('connect');
    setAutoCraft(true);
  }
  useEffect(() => {
    if (autoCraft && selectedLead) {
      setAutoCraft(false);
      void craftMessage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCraft, selectedLead?.id]);

  async function craftMessage() {
    if (!selectedLead) return;
    setCrafting(true);
    setCraftError(null);
    setCraftSent(false);
    try {
      const res = await fetch(`/api/leads/${selectedLead.id}/craft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: ctxText.trim() || undefined }),
      });
      const json = await res.json() as { message?: string; why?: string; alt?: string; error?: string };
      if (json.error || !json.message) throw new Error(json.error ?? 'No message returned');
      setCraftResult({ message: json.message, why: json.why ?? '', alt: json.alt ?? '' });
    } catch (e) {
      setCraftError(e instanceof Error ? e.message : 'Craft failed');
    } finally {
      setCrafting(false);
    }
  }

  async function sendCrafted(message: string) {
    if (!selectedLead?.ghl_contact_id) return;
    setCraftSending(true);
    try {
      const res = await fetch(`/api/leads/${selectedLead.id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'sms', message, contactId: selectedLead.ghl_contact_id }),
      });
      if (!res.ok) throw new Error('Send failed');
      setCraftSent(true);
      void fetch('/api/outreaches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: selectedLead.id, channel: 'ghl' }),
      });
    } catch (e) {
      setCraftError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setCraftSending(false);
    }
  }
  const [messageTab, setMessageTab] = useState<'sms' | 'email'>('sms');
  const [smsMessage, setSmsMessage] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Notes
  type LeadNote = { id: string; lead_id: string; text: string; created_at: string };
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // AI research state
  type AiResult = {
    niche: string; estimated_revenue: string; pain_points: string[];
    goals_desires: string[]; personality_read: string; recommended_offer: string;
    dm_message: string; dm_platform: string; follow_up_angle: string;
    objections_to_expect: string[]; green_flags: string[]; red_flags: string[];
    temperature: string; error?: string;
  };
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [dmCopied, setDmCopied] = useState(false);

  // Find socials state
  const [findingSocials, setFindingSocials] = useState(false);
  const [socialsFound, setSocialsFound] = useState<{ facebook_url?: string; instagram_url?: string; linkedin_url?: string } | null>(null);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Add lead modal
  const [showAddModal, setShowAddModal] = useState(false);

  // Team members
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => setDebouncedSearch(search), 250);
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, [search]);

  const fetchKpiCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/counts');
      const json = await res.json() as { total: number; hot: number; call: number; month: number; error?: string };
      if (!json.error) setKpiCounts(json);
    } catch { /* non-fatal */ }
  }, []);

  const fetchOutreachStats = useCallback(async () => {
    try {
      const res = await fetch('/api/outreaches');
      const json = await res.json() as { today: number; this_month: number; avg_per_day: number; error?: string };
      if (!json.error) setOutreachStats(json);
    } catch { /* non-fatal */ }
  }, []);

  const logOutreach = useCallback((leadId: string, channel: string) => {
    // Fire-and-forget: log outreach + reset lead's Days counter
    void fetch('/api/outreaches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, channel }),
    }).then(() => {
      // Update last_update locally so Days badge resets immediately
      const now = new Date().toISOString();
      setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, last_update: now } : l));
      // Refresh outreach stats
      void fetchOutreachStats();
    });
  }, [fetchOutreachStats]);

  const fetchLeads = useCallback(async (page: number, replace: boolean, overrideFilters?: {
    search?: string; stage?: string; quality?: string; source?: string; kpi?: string | null;
  }) => {
    if (replace) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const filters = overrideFilters ?? { search: debouncedSearch, stage: stageFilter, quality: qualityFilter, source: sourceFilter, kpi: activeKpi };
      const params = new URLSearchParams({ page: String(page), limit: '100' });

      // Resolve KPI card to a filter param
      const kpiCard = filters.kpi ? KPI_CARDS.find((c) => c.id === filters.kpi) : null;
      const effectiveStage = kpiCard?.stageFilter ?? (kpiCard ? '' : (filters.stage ?? ''));

      if (filters.search) params.set('search', filters.search);
      if (effectiveStage) params.set('stage', effectiveStage);
      if (filters.quality) params.set('quality', filters.quality);
      if (filters.source) params.set('source', filters.source);

      // "New This Month" KPI — server-side date filter not supported yet, handle client-side note below
      const res = await fetch(`/api/leads?${params.toString()}`);
      const json = await res.json() as { leads: Lead[]; total: number; page: number; hasMore: boolean; error?: string };
      if (json.error) throw new Error(json.error);

      if (replace) {
        setLeads(json.leads ?? []);
        setCurrentPage(1);
      } else {
        setLeads((prev) => [...prev, ...(json.leads ?? [])]);
        setCurrentPage(page);
      }
      setTotalLeads(json.total ?? 0);
      setHasMore(json.hasMore ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leads');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, stageFilter, qualityFilter, sourceFilter, activeKpi]);

  useEffect(() => {
    void fetchLeads(1, true);
    void fetchKpiCounts();
    void fetchOutreachStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch team members
  useEffect(() => {
    fetch('/api/team')
      .then((r) => r.json())
      .then((d: { members?: TeamMember[] }) => { if (d.members) setTeamMembers(d.members); })
      .catch(() => {});
  }, []);

  // Re-fetch when filters change
  useEffect(() => {
    void fetchLeads(1, true, { search: debouncedSearch, stage: stageFilter, quality: qualityFilter, source: sourceFilter, kpi: activeKpi });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, activeKpi, stageFilter, qualityFilter, sourceFilter]);

  // Infinite scroll sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          void fetchLeads(currentPage + 1, false);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, currentPage, fetchLeads]);

  const handleAddTeamMember = async (name: string, role: string) => {
    const res = await fetch('/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role }),
    });
    const data = await res.json() as { member?: TeamMember };
    if (data.member) setTeamMembers((prev) => [...prev, data.member!].sort((a, b) => a.name.localeCompare(b.name)));
  };

  // ESC closes panel
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedLead(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Fetch notes when panel opens / lead changes
  useEffect(() => {
    if (!selectedLead) { setNotes([]); return; }
    setNotesLoading(true);
    fetch(`/api/leads/${selectedLead.id}/notes`)
      .then((r) => r.json())
      .then((d: { notes?: LeadNote[] }) => setNotes(d.notes ?? []))
      .catch(() => {})
      .finally(() => setNotesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLead?.id]);

  // ── Computed data ──────────────────────────────────────────────────────────

  // leads IS already filtered/paginated from the server
  const grouped = useMemo(() => groupLeadsByStage(leads), [leads]);

  const hasActiveFilters = !!(search || activeKpi || stageFilter || qualityFilter || sourceFilter);
  const flatMode = !!(activeKpi || stageFilter || debouncedSearch || qualityFilter || sourceFilter);

  // ── Inline edit ─────────────────────────────────────────────────────────────

  const handleInlineEdit = useCallback(async (id: string, field: string, value: string) => {
    const prevLeads = leads;
    // Optimistic update
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, [field]: value } : l));
    if (selectedLead?.id === id) {
      setSelectedLead((prev) => prev ? { ...prev, [field]: value } : prev);
    }
    try {
      const res = await fetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [field]: value }),
      });
      if (!res.ok) throw new Error('Update failed');
    } catch {
      setLeads(prevLeads);
    }
  }, [leads, selectedLead]);

  // ── Panel actions ────────────────────────────────────────────────────────────

  const handleStageChange = async (newStage: string) => {
    if (!selectedLead) return;
    await handleInlineEdit(selectedLead.id, 'prospect_stage', newStage);
  };

  const handleAddNote = async () => {
    if (!selectedLead || !newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/leads/${selectedLead.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newNote.trim() }),
      });
      const data = await res.json() as { note?: LeadNote };
      if (data.note) {
        setNotes((prev) => [data.note!, ...prev]);
        setNewNote('');
        // Update last_update in local state
        const now = new Date().toISOString();
        setLeads((prev) => prev.map((l) => l.id === selectedLead.id ? { ...l, last_update: now } : l));
        setSelectedLead((p) => p ? { ...p, last_update: now } : p);
      }
    } finally {
      setSavingNote(false);
    }
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingLead, setDeletingLead] = useState(false);

  const handleDeleteLead = async () => {
    if (!selectedLead) return;
    setDeletingLead(true);
    await fetch(`/api/leads/${selectedLead.id}`, { method: 'DELETE' });
    setLeads((prev) => prev.filter((l) => l.id !== selectedLead.id));
    setSelectedLead(null);
    setConfirmDelete(false);
    setDeletingLead(false);
  };

  const handleDeleteNote = async (noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    await fetch(`/api/leads/${selectedLead!.id}/notes`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId }),
    });
  };

  const handleSendMessage = async () => {
    if (!selectedLead?.ghl_contact_id) {
      alert('No GHL Contact ID for this lead');
      return;
    }
    setSending(true);
    const isSms = messageTab === 'sms';
    try {
      const res = await fetch(`/api/leads/${selectedLead.id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: messageTab,
          message: isSms ? smsMessage : emailMessage,
          subject: emailSubject,
          contactId: selectedLead.ghl_contact_id,
        }),
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) {
        alert(`Send failed: ${json.error}`);
        return;
      }
      const entry = `[${new Date().toISOString()}] ${messageTab.toUpperCase()}: ${isSms ? smsMessage : emailMessage}\n\n`;
      const newFeed = entry + (selectedLead.ongoing_message_feed ?? '');
      setSelectedLead((prev) => prev ? { ...prev, ongoing_message_feed: newFeed } : prev);
      if (isSms) setSmsMessage(''); else { setEmailMessage(''); setEmailSubject(''); }
    } finally {
      setSending(false);
    }
  };

  const handleRunAi = async () => {
    if (!selectedLead) return;
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    try {
      const res = await fetch('/api/leads/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedLead.full_name,
          email: selectedLead.email,
          quality: selectedLead.quality,
          revenue_level: selectedLead.revenue_level,
          social_url: selectedLead.social_url,
          instagram_url: selectedLead.instagram_url,
          linkedin_url: selectedLead.linkedin_url,
          facebook_url: selectedLead.facebook_url,
          notes: selectedLead.notes,
          source: selectedLead.source,
        }),
      });
      const json = await res.json() as AiResult & { error?: string };
      if (json.error) throw new Error(json.error);
      setAiResult(json);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI failed');
    } finally {
      setAiLoading(false);
    }
  };

  const handleFindSocials = async () => {
    if (!selectedLead) return;
    setFindingSocials(true);
    setSocialsFound(null);
    try {
      const res = await fetch('/api/leads/find-socials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selectedLead.full_name, email: selectedLead.email, phone: selectedLead.phone }),
      });
      const json = await res.json() as { facebook_url?: string; instagram_url?: string; linkedin_url?: string; error?: string };
      if (json.error) throw new Error(json.error);
      setSocialsFound(json);
      // Auto-save any found URLs that aren't already set
      const updates: Record<string, string> = {};
      if (json.facebook_url && !selectedLead.facebook_url) updates.facebook_url = json.facebook_url;
      if (json.instagram_url && !selectedLead.instagram_url) updates.instagram_url = json.instagram_url;
      if (json.linkedin_url && !selectedLead.linkedin_url) updates.linkedin_url = json.linkedin_url;
      if (Object.keys(updates).length > 0) {
        for (const [field, val] of Object.entries(updates)) {
          void handleInlineEdit(selectedLead.id, field, val);
        }
        setSelectedLead((p) => p ? { ...p, ...updates } : p);
        setLeads((prev) => prev.map((l) => l.id === selectedLead.id ? { ...l, ...updates } : l));
      }
    } catch (err) {
      setSocialsFound({ });
    } finally {
      setFindingSocials(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/leads/sync', { method: 'POST' });
      const json = await res.json() as { success: boolean; count?: number; error?: string };
      if (json.success) {
        setSyncResult(`Synced ${json.count ?? 0} leads`);
        await fetchLeads(1, true);
        void fetchKpiCounts();
      } else {
        setSyncResult(`Error: ${json.error}`);
      }
    } catch {
      setSyncResult('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setActiveKpi(null);
    setStageFilter('');
    setQualityFilter('');
    setSourceFilter('');
  };

  // ── Chart data ───────────────────────────────────────────────────────────────

  const pipelineData = useMemo(() => {
    const order = ['🔥 Hot Prospect', '📞 Call Booked', '🔗 Pay Link Sent', '📣 Reached Out', '👨 Prospect'];
    const counts: Record<string, number> = {};
    for (const l of leads) {
      const s = l.prospect_stage ?? 'Unknown';
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return order.map((s) => ({ stage: s, count: counts[s] ?? 0 })).filter((d) => d.count > 0);
  }, [leads]);

  const monthlyData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of leads) {
      if (!l.opt_in_date) continue;
      const d = new Date(l.opt_in_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([key, count]) => {
        const [yr, mo] = key.split('-');
        const label = new Date(Number(yr), Number(mo) - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        return { key, label, count };
      });
  }, [leads]);

  const recentLeads = useMemo(() =>
    [...leads]
      .filter((l) => l.opt_in_date)
      .sort((a, b) => new Date(b.opt_in_date!).getTime() - new Date(a.opt_in_date!).getTime())
      .slice(0, 20),
    [leads]
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm px-4 md:px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <SubTabs group="leads" className="mb-0" />
          <div className="flex items-center gap-2 flex-wrap">
            {/* View toggle */}
            <div className="flex bg-zinc-800 border border-zinc-700 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-xs rounded transition-colors font-medium ${viewMode === 'list' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                ☰ List
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={`px-3 py-1.5 text-xs rounded transition-colors font-medium ${viewMode === 'kanban' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                ⬜ Kanban
              </button>
            </div>
            {/* Recent toggle */}
            <button
              onClick={() => setShowRecent((v) => !v)}
              className={`px-3 py-2 text-sm rounded-lg border transition-colors flex items-center gap-1.5 ${showRecent ? 'bg-sky-600 border-sky-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'}`}
            >
              <span>🕐</span>
              <span className="hidden sm:inline text-xs">Recent</span>
            </button>

            {/* Add Lead */}
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500 border border-blue-500 rounded-lg transition-colors flex items-center gap-1.5 font-medium"
            >
              <span>➕</span>
              <span className="hidden sm:inline text-xs">Add Lead</span>
            </button>

            {/* Sync */}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {syncing ? (
                <span className="inline-block w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
              ) : <span>🔄</span>}
              <span className="hidden sm:inline text-xs">Sync</span>
            </button>
          </div>
        </div>
        {syncResult && <p className="text-xs text-zinc-400 mt-1.5">{syncResult}</p>}
      </div>

      <div className="p-4 md:p-6 space-y-6">

        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* ── Main tab switch: leads · follow-up next · data ─────────────────── */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-1">
          {([
            ['leads', '🎯 Leads'],
            ['followup', '🔁 Follow-Up Next'],
            ['data', '📊 Dashboard'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMainTab(key)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${mainTab === key ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-zinc-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Follow-Up Next queue (own tab) ─────────────────────────────────── */}
        {mainTab === 'followup' && (
          <ConnectNextQueue
            onOpenLead={(id) => {
              const lead = leads.find((l) => l.id === id);
              if (lead) { setSelectedLead(lead); setPanelTab('connect'); }
              else setSearch('');
            }}
          />
        )}

        {/* ── KPI cards (data tab; clicking filters + jumps to leads) ────────── */}
        {mainTab === 'data' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {KPI_CARDS.map((card) => {
            const count = countForCard(kpiCounts, card);
            const isActive = activeKpi === card.id;
            return (
              <button
                key={card.id}
                onClick={() => { setActiveKpi(isActive ? null : card.id); if (!isActive) setMainTab('leads'); }}
                className={`relative group rounded-xl border p-4 text-left transition-all duration-150
                  ${isActive
                    ? `bg-zinc-800 ring-2 ${card.ringColor} border-transparent scale-[1.01]`
                    : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/80 hover:scale-[1.005]'
                  }`}
              >
                {/* Arrow */}
                <span className="absolute top-3 right-3 text-zinc-600 group-hover:text-zinc-400 transition-colors text-xs">↗</span>
                {/* Emoji */}
                <div className="text-2xl mb-2 leading-none">{card.emoji}</div>
                {/* Count */}
                <div className={`text-3xl font-bold leading-none mb-1.5 ${card.numberColor}`}>
                  {loading ? <span className="text-zinc-700">—</span> : count.toLocaleString()}
                </div>
                {/* Label */}
                <div className="text-xs text-zinc-500 uppercase tracking-wide font-medium leading-tight">
                  {card.label}
                </div>
              </button>
            );
          })}
        </div>
        )}

        {/* ── Outreach stats bar ─────────────────────────────────────────────── */}
        {mainTab === 'data' && (
        <div className="grid grid-cols-3 gap-3">
          {/* Today */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="text-2xl leading-none">📤</div>
            <div>
              <div className="text-2xl font-bold text-white leading-none">{outreachStats.today}</div>
              <div className="text-xs text-zinc-500 uppercase tracking-wide mt-1">Outreaches today</div>
            </div>
          </div>
          {/* This month */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="text-2xl leading-none">📆</div>
            <div>
              <div className="text-2xl font-bold text-sky-400 leading-none">{outreachStats.this_month}</div>
              <div className="text-xs text-zinc-500 uppercase tracking-wide mt-1">This month</div>
            </div>
          </div>
          {/* Avg per day */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="text-2xl leading-none">📊</div>
            <div>
              <div className="text-2xl font-bold text-emerald-400 leading-none">{outreachStats.avg_per_day}</div>
              <div className="text-xs text-zinc-500 uppercase tracking-wide mt-1">Avg / day</div>
            </div>
          </div>
        </div>
        )}

        {/* ── Recent Leads panel ─────────────────────────────────────────────── */}
        {showRecent && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-200">🕐 Most Recent Leads</h3>
              <span className="text-xs text-zinc-500">Last 20 opt-ins</span>
            </div>
            <div className="space-y-2">
              {recentLeads.map((lead) => (
                <button
                  key={lead.id}
                  onClick={() => { setSelectedLead(lead); setShowRecent(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-100 truncate">{lead.full_name ?? '—'}</div>
                    <div className="text-xs text-zinc-500 truncate">{lead.email ?? lead.phone ?? '—'}</div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-xs text-zinc-400">{formatDate(lead.opt_in_date)}</div>
                    {lead.prospect_stage && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${STAGE_COLORS[lead.prospect_stage] ?? 'bg-zinc-700 text-zinc-300'}`}>
                        {lead.prospect_stage}
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {recentLeads.length === 0 && <p className="text-xs text-zinc-600 text-center py-2">No leads with opt-in dates</p>}
            </div>
          </div>
        )}

        {/* ── Analytics charts (data tab) ────────────────────────────────────── */}
        {mainTab === 'data' && !showRecent && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Conversion funnel: leads → reached → booked → paid */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 md:col-span-2">
              <h3 className="text-sm font-semibold text-zinc-200 mb-4">🪜 Conversion Funnel</h3>
              <div className="grid grid-cols-4 gap-2">
                {(() => {
                  const stageCount = (s: string) => pipelineData.find((d) => d.stage === s)?.count ?? 0;
                  const total = kpiCounts.total || 1;
                  const reached = stageCount('📣 Reached Out') + stageCount('🔥 Hot Prospect') + stageCount('📞 Call Booked') + stageCount('🔗 Pay Link Sent');
                  const booked = stageCount('📞 Call Booked') + stageCount('🔗 Pay Link Sent');
                  const paid = stageCount('🔗 Pay Link Sent');
                  const steps = [
                    { label: 'Total Leads', n: kpiCounts.total, color: 'text-white' },
                    { label: 'In Conversation', n: reached, color: 'text-blue-300' },
                    { label: 'Call Booked+', n: booked, color: 'text-violet-300' },
                    { label: 'Pay Link Sent', n: paid, color: 'text-pink-300' },
                  ];
                  return steps.map((s, i) => (
                    <div key={s.label} className="bg-zinc-800/60 rounded-xl p-3 text-center">
                      <div className={`text-2xl font-bold ${s.color}`}>{s.n.toLocaleString()}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wide mt-1">{s.label}</div>
                      {i > 0 && <div className="text-[10px] text-zinc-600 mt-0.5">{Math.round((s.n / Math.max(steps[i - 1].n, 1)) * 100)}% of prev</div>}
                    </div>
                  ));
                })()}
              </div>
              <p className="text-[10px] text-zinc-600 mt-2">Conversation and booking counts reflect the leads currently loaded in this view.</p>
            </div>

            {/* Source breakdown */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-200 mb-4">🌱 Leads by Source</h3>
              <div className="space-y-2.5">
                {(() => {
                  const bySource: Record<string, number> = {};
                  for (const l of leads) {
                    let s = l.source ?? 'Unknown';
                    if (/unknown/i.test(s)) s = 'Unknown';
                    bySource[s] = (bySource[s] ?? 0) + 1;
                  }
                  const rows = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 8);
                  const max = Math.max(...rows.map(([, n]) => n), 1);
                  return rows.map(([source, n]) => (
                    <button key={source} onClick={() => { setSourceFilter(source === 'Unknown' ? '' : source); setMainTab('leads'); }} className="w-full group text-left">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">{source}</span>
                        <span className="text-xs font-semibold text-zinc-300">{n.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${Math.round((n / max) * 100)}%` }} />
                      </div>
                    </button>
                  ));
                })()}
              </div>
            </div>

            {/* Pipeline stage breakdown */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-200 mb-4">📊 Pipeline Breakdown</h3>
              <div className="space-y-2.5">
                {pipelineData.map(({ stage, count }) => {
                  const max = Math.max(...pipelineData.map((d) => d.count), 1);
                  const pct = Math.round((count / max) * 100);
                  const color = {
                    '🔥 Hot Prospect': 'bg-orange-500',
                    '📞 Call Booked': 'bg-violet-500',
                    '🔗 Pay Link Sent': 'bg-pink-500',
                    '📣 Reached Out': 'bg-blue-500',
                    '👨 Prospect': 'bg-zinc-500',
                  }[stage] ?? 'bg-zinc-600';
                  return (
                    <button
                      key={stage}
                      onClick={() => { setStageFilter(stage); setActiveKpi(null); setMainTab('leads'); }}
                      className="w-full group text-left"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">{stage}</span>
                        <span className="text-xs font-semibold text-zinc-300">{count.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* New leads by month */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-200 mb-4">📈 New Leads by Month</h3>
              {monthlyData.length === 0 ? (
                <p className="text-xs text-zinc-600 text-center py-6">No opt-in date data available</p>
              ) : (
                <div className="flex items-end gap-1 h-28">
                  {monthlyData.map(({ key, label, count }) => {
                    const max = Math.max(...monthlyData.map((d) => d.count), 1);
                    const heightPct = Math.max((count / max) * 100, 4);
                    const isCurrentMonth = key === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
                    return (
                      <div key={key} className="flex-1 flex flex-col items-center gap-1 group">
                        <span className="text-[9px] text-zinc-600 group-hover:text-zinc-400 transition-colors">{count}</span>
                        <div className="w-full flex items-end" style={{ height: '72px' }}>
                          <div
                            className={`w-full rounded-t transition-all duration-300 ${isCurrentMonth ? 'bg-sky-500' : 'bg-zinc-600 group-hover:bg-zinc-500'}`}
                            style={{ height: `${heightPct}%` }}
                          />
                        </div>
                        <span className={`text-[9px] leading-tight text-center ${isCurrentMonth ? 'text-sky-400 font-semibold' : 'text-zinc-600'}`}>
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Filter bar (leads tab) ─────────────────────────────────────────── */}
        {mainTab === 'leads' && (
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">🔍</span>
            <input
              type="text"
              placeholder="Search name, phone, email, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500"
            />
          </div>

          {/* Stage dropdown */}
          <select
            value={activeKpi ? '' : stageFilter}
            onChange={(e) => { setStageFilter(e.target.value); setActiveKpi(null); }}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-500 cursor-pointer"
          >
            <option value="">🎯 All Stages ({leads.length.toLocaleString()})</option>
            {ALL_STAGES.map((s) => {
              const c = pipelineData.find((p) => p.stage === s)?.count ?? 0;
              return <option key={s} value={s}>{s} ({c.toLocaleString()})</option>;
            })}
          </select>

          {/* Quality dropdown — hidden on mobile to keep the top clean */}
          <select
            value={qualityFilter}
            onChange={(e) => setQualityFilter(e.target.value)}
            className="hidden sm:block bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-500 cursor-pointer"
          >
            <option value="">All Quality</option>
            {QUALITY_OPTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
          </select>

          {/* Source dropdown — hidden on mobile to keep the top clean */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="hidden sm:block bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-500 cursor-pointer"
          >
            <option value="">All Sources</option>
            {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-xs bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
            >
              ✕ Clear
            </button>
          )}

          {/* Result count */}
          <span className="text-xs text-zinc-500 ml-auto">
            {leads.length.toLocaleString()} of {totalLeads.toLocaleString()} leads
          </span>
        </div>
        )}

        {/* ── Main content (leads tab) ────────────────────────────────────────── */}
        {mainTab === 'leads' && (loading ? (
          <SkeletonRows />
        ) : viewMode === 'list' ? (
          <ListView
            grouped={grouped}
            collapsedGroups={collapsedGroups}
            setCollapsedGroups={setCollapsedGroups}
            onSelectLead={(lead) => { setSelectedLead(lead); setPanelTab('info'); }}
            selectedLeadId={selectedLead?.id}
            onInlineEdit={handleInlineEdit}
            flatMode={flatMode}
            onOutreach={logOutreach}
            onCraft={openAndCraft}
            onFollowUp={(id, date) => {
              setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, follow_up_date: date } : l)));
              if (selectedLead?.id === id) setSelectedLead((s) => (s ? { ...s, follow_up_date: date } : s));
              void fetch('/api/leads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, follow_up_date: date }) });
            }}
            onStage={(id, stage) => {
              setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, prospect_stage: stage } : l)));
              if (selectedLead?.id === id) setSelectedLead((s) => (s ? { ...s, prospect_stage: stage } : s));
              void handleInlineEdit(id, 'prospect_stage', stage);
            }}
            onHot={(id, next) => {
              setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, hot: next } : l)));
              if (selectedLead?.id === id) setSelectedLead((s) => (s ? { ...s, hot: next } : s));
              void fetch(`/api/leads/${id}/hot`, { method: next ? 'POST' : 'DELETE' });
            }}
          />
        ) : (
          <KanbanView leads={leads} onSelectLead={setSelectedLead} onStageChange={(id, stage) => void handleInlineEdit(id, 'prospect_stage', stage)} />
        ))}

        {/* Infinite scroll sentinel */}
        {mainTab === 'leads' && <div ref={sentinelRef} className="h-8" />}
        {loadingMore && <div className="text-center text-zinc-500 text-sm py-4">Loading more…</div>}
      </div>

      {/* ── Add Lead Modal ───────────────────────────────────────────────────── */}
      {showAddModal && (
        <AddLeadModal
          onClose={() => setShowAddModal(false)}
          onCreated={(lead, openContext) => {
            setLeads((prev) => [lead, ...prev]);
            setTotalLeads((prev) => prev + 1);
            void fetchKpiCounts();
            // A screenshot was attached — open straight into their saved context
            if (openContext) {
              setSelectedLead(lead);
              setPanelTab('context');
            }
          }}
        />
      )}

      {/* ── Slide-out panel ──────────────────────────────────────────────────── */}
      {selectedLead && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setSelectedLead(null)}
          />
          <div className="fixed inset-y-0 right-0 w-full md:w-[480px] bg-zinc-900 border-l border-zinc-700 shadow-2xl z-50 flex flex-col">
            {/* Panel header */}
            <div className="flex-shrink-0 border-b border-zinc-700 p-4 space-y-3">
              {/* Name + close */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-white truncate leading-tight">
                    {selectedLead.full_name ?? 'Unknown'}
                  </h2>
                  {selectedLead.phone && (
                    <a
                      href={`tel:${cleanPhone(selectedLead.phone)}`}
                      className="text-sm text-blue-400 hover:text-blue-300 mt-0.5 block"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {selectedLead.phone}
                    </a>
                  )}
                  {selectedLead.email && !selectedLead.phone && (
                    <div className="text-xs text-zinc-400 mt-0.5 truncate">{selectedLead.email}</div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedLead(null)}
                  className="text-zinc-400 hover:text-white text-2xl leading-none flex-shrink-0 p-1 -mt-1"
                >
                  ×
                </button>
              </div>

              {/* Stage select */}
              <select
                value={selectedLead.prospect_stage ?? ''}
                onChange={(e) => handleStageChange(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              >
                {ALL_STAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              {/* Primary contact actions */}
              {selectedLead.phone && (
                <div className="grid grid-cols-3 gap-2">
                  <a
                    href={`tel:${cleanPhone(selectedLead.phone)}`}
                    className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/40 active:bg-blue-600/50 border border-blue-600/30 text-blue-300 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                    </svg>
                    <span className="text-xs font-semibold">Call</span>
                  </a>
                  <a
                    href={`sms:${cleanPhone(selectedLead.phone)}`}
                    className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl bg-green-600/20 hover:bg-green-600/40 active:bg-green-600/50 border border-green-600/30 text-green-300 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                    </svg>
                    <span className="text-xs font-semibold">iMessage</span>
                  </a>
                  <a
                    href={`https://wa.me/${cleanPhone(selectedLead.phone).replace(/^\+/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/40 active:bg-emerald-600/50 border border-emerald-600/30 text-emerald-300 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    </svg>
                    <span className="text-xs font-semibold">WhatsApp</span>
                  </a>
                </div>
              )}

              {/* Referral Party — puts their email on the NEXT party invite only */}
              <div>
                {partyInvite ? (
                  <div className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                    🎉 On the {party?.label ?? 'next'} Referral Party invite
                  </div>
                ) : (
                  <button
                    onClick={() => void inviteToParty()}
                    disabled={partyBusy || !selectedLead.email}
                    title={selectedLead.email ? 'Add them to the next Referral Party calendar invite' : 'This lead has no email address'}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 disabled:opacity-40 text-white text-xs font-bold transition-all"
                  >
                    {partyBusy ? 'Adding…' : '🎉 Invite to Referral Party'}
                  </button>
                )}
                <p className="text-[10px] text-zinc-600 text-center mt-1">
                  {partyErr
                    ? <span className="text-rose-400">{partyErr}</span>
                    : party ? <>Adds their email to the {party.label} invite — that one only.</> : 'Adds their email to the next party invite.'}
                </p>
              </div>

              {/* Secondary actions */}
              <div className="flex gap-2">
                <a
                  href={selectedLead.ghl_contact_id
                    ? `https://app.gohighlevel.com/v2/location/ZJQSLWJWH7OVHVrJjmPj/contacts/${selectedLead.ghl_contact_id}`
                    : `https://app.gohighlevel.com/v2/location/ZJQSLWJWH7OVHVrJjmPj/contacts/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center px-3 py-2 bg-orange-600/20 hover:bg-orange-600/40 border border-orange-600/30 rounded-xl text-xs font-semibold text-orange-300 transition-colors"
                >
                  ⚡ GHL
                </a>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex-1 text-center px-3 py-2 bg-red-600/20 hover:bg-red-600/40 border border-red-600/30 rounded-xl text-xs font-semibold text-red-400 transition-colors"
                >
                  🗑 Delete
                </button>
              </div>
            </div>

            {/* Delete confirmation dialog */}
            {confirmDelete && (
              <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-sm z-20 flex items-center justify-center p-6">
                <div className="bg-zinc-900 border border-red-700 rounded-xl p-6 max-w-xs w-full shadow-2xl">
                  <h3 className="text-white font-semibold text-base mb-2">Delete this lead?</h3>
                  <p className="text-zinc-400 text-sm mb-1">
                    <span className="text-white font-medium">{selectedLead.full_name}</span> will be permanently removed.
                  </p>
                  <p className="text-red-400 text-xs mb-5">This cannot be undone.</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 px-4 py-2 rounded-lg border border-zinc-600 text-zinc-300 text-sm hover:bg-zinc-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void handleDeleteLead()}
                      disabled={deletingLead}
                      className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {deletingLead ? 'Deleting…' : 'Delete permanently'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex-shrink-0 border-b border-zinc-700 flex">
              {(['connect', 'info', 'context', 'message', 'notes', 'ai'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setPanelTab(tab)}
                  className={`flex-1 py-3 text-xs sm:text-sm font-medium transition-colors ${
                    panelTab === tab
                      ? 'text-white border-b-2 border-zinc-300'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tab === 'connect' ? '⚡ Connect' : tab === 'info' ? 'ℹ️ Info' : tab === 'context' ? '📸 Context' : tab === 'message' ? '💬 Message' : tab === 'notes' ? '📝 Notes' : '🤖 AI'}
                </button>
              ))}
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto">

              {/* ── CONNECT TAB — notes in, perfect message out ── */}
              {panelTab === 'connect' && (
                <div className="p-4 space-y-4">
                  {/* At-a-glance chips */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {selectedLead.prospect_stage && <span className="text-[11px] px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 font-medium">{selectedLead.prospect_stage}</span>}
                    {selectedLead.quality && <span className="text-[11px] px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 font-medium">{selectedLead.quality}</span>}
                    {selectedLead.source && <span className="text-[11px] px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">🌱 {selectedLead.source}</span>}
                    {selectedLead.revenue_level && <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-900/30 border border-emerald-800/40 text-emerald-300">💵 {selectedLead.revenue_level}</span>}
                  </div>

                  {/* 📅 Follow-up date — feeds Today */}
                  {(() => {
                    const today = new Date().toISOString().split('T')[0];
                    const plus = (d: number) => new Date(Date.now() + d * 86400000).toISOString().split('T')[0];
                    const fu = selectedLead.follow_up_date;
                    const overdue = fu && fu < today;
                    const isToday = fu === today;
                    return (
                      <div className={`rounded-2xl p-3.5 border ${overdue ? 'bg-rose-950/30 border-rose-800/40' : isToday ? 'bg-amber-950/30 border-amber-800/40' : 'bg-zinc-800/60 border-zinc-700'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-white font-semibold text-sm">📅 Follow up on</p>
                          {fu && (
                            <span className={`text-xs font-bold ${overdue ? 'text-rose-300' : isToday ? 'text-amber-300' : 'text-blue-300'}`}>
                              {overdue ? 'OVERDUE' : isToday ? 'TODAY' : new Date(fu + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {([['Today', today], ['Tomorrow', plus(1)], ['+3d', plus(3)], ['+1wk', plus(7)]] as const).map(([lbl, val]) => (
                            <button
                              key={lbl}
                              onClick={() => void setFollowUpDate(val)}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${fu === val ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500'}`}
                            >
                              {lbl}
                            </button>
                          ))}
                          <input
                            type="date"
                            value={fu ?? ''}
                            onChange={(e) => void setFollowUpDate(e.target.value || null)}
                            className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                          />
                          {fu && (
                            <button onClick={() => void setFollowUpDate(null)} className="px-2 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-rose-400 transition-colors">✕ clear</button>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* 🧭 DM Conversation Stage — the SOP process */}
                  <div className="bg-zinc-800/60 border border-zinc-700 rounded-2xl p-4">
                    <p className="text-white font-semibold text-sm mb-2.5">🧭 Where&apos;s the conversation?</p>
                    <div className="flex gap-1">
                      {DM_STAGES.map((s, i) => {
                        const activeIdx = DM_STAGES.findIndex((x) => x.key === selectedLead.dm_stage);
                        const isActive = selectedLead.dm_stage === s.key;
                        const isPast = activeIdx >= 0 && i < activeIdx;
                        return (
                          <button
                            key={s.key}
                            onClick={() => void setDmStage(s.key)}
                            title={s.label}
                            className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border text-center transition-all ${
                              isActive ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20 scale-[1.03]'
                              : isPast ? 'bg-emerald-900/20 border-emerald-800/40 text-emerald-400'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                            }`}
                          >
                            <span className="text-base leading-none">{isPast ? '✓' : s.emoji}</span>
                            <span className="text-[9px] font-semibold leading-none">{s.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    {(() => {
                      const stage = DM_STAGES.find((s) => s.key === selectedLead.dm_stage);
                      if (!stage) return <p className="text-zinc-600 text-xs mt-2.5">Tap the stage this conversation is at — the right scripts and next move appear.</p>;
                      const stageScripts = allScripts.filter((s) => s.category === stage.scriptCategory);
                      return (
                        <div className="mt-3 space-y-2">
                          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl px-3 py-2.5">
                            <p className="text-blue-300 text-[10px] uppercase tracking-wide font-bold mb-0.5">▶ Next move</p>
                            <p className="text-zinc-300 text-xs leading-relaxed">{stage.nextMove}</p>
                          </div>
                          {stageScripts.length > 0 && (
                            <div>
                              <button onClick={() => setStageScriptsOpen((v) => !v)} className="text-zinc-500 hover:text-white text-[10px] uppercase tracking-wide font-bold px-1 transition-colors">
                                📜 {stage.label} scripts ({stageScripts.length}) {stageScriptsOpen ? '▾' : '▸'}
                              </button>
                              {stageScriptsOpen && stageScripts.map((s, si) => {
                                const first = (selectedLead.full_name ?? '').split(' ')[0] || 'there';
                                const filled = s.body.replaceAll('{name}', first);
                                const cid = `stage_${si}`;
                                return (
                                  <button
                                    key={si}
                                    onClick={() => { void navigator.clipboard.writeText(filled); setCraftCopied(cid); setTimeout(() => setCraftCopied(null), 1500); }}
                                    className="w-full text-left bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl px-3 py-2 mt-1.5 transition-colors"
                                  >
                                    <p className="text-zinc-600 text-[10px] mb-0.5">{s.title} — tap to copy</p>
                                    <p className="text-zinc-300 text-xs leading-relaxed whitespace-pre-wrap line-clamp-3">{craftCopied === cid ? '✓ Copied!' : filled}</p>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* 👑 Authority + 🥊 Challenge quick-draws */}
                  <div className="grid grid-cols-2 gap-2">
                    {([['authority', '👑 Authority Drops'], ['challenge', '🥊 Challenge Plays']] as const).map(([cat, catLabel]) => {
                      const catScripts = allScripts.filter((s) => s.category === cat);
                      if (!catScripts.length) return null;
                      const isOpen = quickDraw === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => setQuickDraw(isOpen ? null : cat)}
                          className={`py-2.5 rounded-xl border text-xs font-semibold transition-all ${isOpen ? 'bg-amber-600/30 border-amber-600/50 text-amber-200' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600'}`}
                        >
                          {catLabel} ({catScripts.length})
                        </button>
                      );
                    })}
                  </div>
                  {quickDraw && (
                    <div className="space-y-1.5 -mt-1">
                      {allScripts.filter((s) => s.category === quickDraw).map((s, si) => {
                        const first = (selectedLead.full_name ?? '').split(' ')[0] || 'there';
                        const filled = s.body.replaceAll('{name}', first);
                        const cid = `qd_${si}`;
                        return (
                          <button
                            key={si}
                            onClick={() => { void navigator.clipboard.writeText(filled); setCraftCopied(cid); setTimeout(() => setCraftCopied(null), 1500); }}
                            className="w-full text-left bg-zinc-900 border border-zinc-800 hover:border-amber-700/50 rounded-xl px-3 py-2 transition-colors"
                          >
                            <p className="text-zinc-600 text-[10px] mb-0.5">{s.title} — tap to copy</p>
                            <p className="text-zinc-300 text-xs leading-relaxed">{craftCopied === cid ? '✓ Copied!' : filled}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 🧠 Context capture — save notes, they fuel the message */}
                  <div className="bg-zinc-800/60 border border-zinc-700 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-white font-semibold text-sm">🧠 Add what you know</p>
                      <button
                        onClick={toggleRecording}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${recording ? 'bg-rose-600 text-white animate-pulse' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                      >
                        {recording ? '⏹ Stop' : '🎤 Speak'}
                      </button>
                    </div>
                    <textarea
                      value={ctxText}
                      onChange={(e) => setCtxText(e.target.value)}
                      placeholder="Speak or type... what they said, where their head's at, what's changed"
                      rows={3}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-none"
                    />
                    <button
                      onClick={() => void saveCtxNote()}
                      disabled={savingCtx || !ctxText.trim()}
                      className="w-full mt-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors disabled:opacity-40 text-sm"
                    >
                      {savingCtx ? 'Saving…' : '💾 Save Note'}
                    </button>
                  </div>

                  {/* 🗒 Saved notes — the fuel */}
                  {notes.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wide px-1">🗒 Saved Notes ({notes.length})</p>
                      {notes.slice(0, 4).map((n) => (
                        <div key={n.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5">
                          <p className="text-zinc-300 text-xs leading-relaxed">{n.text}</p>
                          <p className="text-zinc-600 text-[10px] mt-1">{new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                        </div>
                      ))}
                      {notes.length > 4 && (
                        <button onClick={() => setPanelTab('notes')} className="text-zinc-500 hover:text-white text-xs px-1 transition-colors">
                          → all {notes.length} notes
                        </button>
                      )}
                    </div>
                  )}

                  {/* ✨ Craft — pulls notes + calls + payments + scripts */}
                  <button
                    onClick={() => void craftMessage()}
                    disabled={crafting}
                    className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-bold rounded-2xl transition-all disabled:opacity-40 text-sm shadow-lg shadow-violet-500/20"
                  >
                    {crafting ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Reading notes, calls, payments… writing
                      </span>
                    ) : '✨ Craft the Message'}
                  </button>
                  <p className="text-[10px] text-zinc-600 -mt-2 text-center">Built from every saved note, sales call, and payment on record 🎯</p>
                  {craftError && <p className="text-rose-400 text-xs text-center">{craftError}</p>}

                  {/* Crafted message */}
                  {craftResult && (
                    <div className="space-y-3">
                      <div className="bg-gradient-to-br from-blue-950/40 to-zinc-900 border border-blue-700/40 rounded-2xl p-4">
                        <p className="text-blue-300 text-[10px] uppercase tracking-wide font-bold mb-2">The Message</p>
                        <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{craftResult.message}</p>
                        <p className="text-zinc-500 text-xs mt-2 italic">💡 {craftResult.why}</p>
                        <div className="flex gap-2 mt-3">
                          {selectedLead.ghl_contact_id && (
                            <button
                              onClick={() => void sendCrafted(craftResult.message)}
                              disabled={craftSending || craftSent}
                              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${craftSent ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-600/40' : 'bg-violet-600 hover:bg-violet-500 text-white'}`}
                            >
                              {craftSent ? '✓ Sent via GHL' : craftSending ? 'Sending…' : '⚡ Send via GHL'}
                            </button>
                          )}
                          <button
                            onClick={() => { void navigator.clipboard.writeText(craftResult.message); setCraftCopied('main'); setTimeout(() => setCraftCopied(null), 1500); }}
                            className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold transition-colors"
                          >
                            {craftCopied === 'main' ? '✓ Copied' : '📋 Copy'}
                          </button>
                          {selectedLead.phone && (
                            <a href={smsHref(cleanPhone(selectedLead.phone), craftResult.message)} className="flex-1 py-2.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/30 text-blue-300 text-xs font-semibold text-center transition-colors">
                              💬 iMessage
                            </a>
                          )}
                          {selectedLead.phone && (
                            <a href={waHref(cleanPhone(selectedLead.phone), craftResult.message)} target="_blank" rel="noreferrer" className="flex-1 py-2.5 rounded-xl bg-green-600/20 hover:bg-green-600/40 border border-green-600/30 text-green-300 text-xs font-semibold text-center transition-colors">
                              📱 WhatsApp
                            </a>
                          )}
                        </div>
                      </div>
                      {craftResult.alt && (
                        <button
                          onClick={() => { void navigator.clipboard.writeText(craftResult.alt); setCraftCopied('alt'); setTimeout(() => setCraftCopied(null), 1500); }}
                          className="w-full text-left bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-2xl p-4 transition-colors"
                        >
                          <p className="text-zinc-500 text-[10px] uppercase tracking-wide font-bold mb-1.5">Alternate angle — tap to copy</p>
                          <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{craftCopied === 'alt' ? '✓ Copied!' : craftResult.alt}</p>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Intel: sales calls + payments */}
                  <div className="space-y-2.5">
                    <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wide px-1">📊 What the system knows</p>
                    {!intel ? (
                      <p className="text-zinc-600 text-xs px-1 animate-pulse">Loading history…</p>
                    ) : (
                      <>
                        {intel.calls.length === 0 && intel.payments.length === 0 && (
                          <p className="text-zinc-600 text-xs px-1">No sales calls or payments on record yet.</p>
                        )}
                        {intel.calls.map((c) => (
                          <div key={c.id} className="bg-zinc-900 border border-violet-900/40 rounded-xl px-4 py-3">
                            <div className="flex items-center justify-between">
                              <p className="text-white text-xs font-semibold">📞 {String(c.call_date ?? '').split('T')[0] || 'Sales call'} · {c.result ?? '—'}</p>
                              {c.deal_amount ? <p className="text-emerald-400 text-xs font-bold">${c.deal_amount.toLocaleString()}</p> : null}
                            </div>
                            {c.offer && <p className="text-zinc-500 text-xs mt-0.5">{c.offer}</p>}
                            {c.objections && c.objections.length > 0 && <p className="text-amber-400/80 text-xs mt-1">Objection: {c.objections.join('; ')}</p>}
                            {c.follow_up_notes && <p className="text-zinc-400 text-xs mt-1 italic">“{c.follow_up_notes}”</p>}
                          </div>
                        ))}
                        {intel.payments.map((p) => (
                          <div key={p.id} className="bg-zinc-900 border border-emerald-900/40 rounded-xl px-4 py-3 flex items-center justify-between">
                            <div>
                              <p className="text-white text-xs font-semibold">💰 {p.status === 'scheduled' ? 'Promised' : p.status === 'collected' ? 'Paid' : p.status}{p.offer ? ` · ${p.offer}` : ''}</p>
                              {p.payment_date && <p className="text-zinc-500 text-xs mt-0.5">{p.payment_date}</p>}
                            </div>
                            <p className={`text-sm font-bold ${p.status === 'scheduled' ? 'text-amber-400' : 'text-emerald-400'}`}>${p.amount.toLocaleString()}</p>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── INFO TAB (fully editable) ── */}
              {panelTab === 'info' && (
                <div className="p-4 space-y-3 text-sm">
                  {/* 🔗 Socials — quick open for the link we captured */}
                  {(() => {
                    const raw = [
                      selectedLead.instagram_url && { icon: '📸', label: 'Instagram', url: selectedLead.instagram_url },
                      selectedLead.facebook_url && { icon: '📘', label: 'Facebook', url: selectedLead.facebook_url },
                      selectedLead.linkedin_url && { icon: '💼', label: 'LinkedIn', url: selectedLead.linkedin_url },
                      selectedLead.social_url && ((): { icon: string; label: string; url: string } => {
                        const u = selectedLead.social_url!.toLowerCase();
                        const p = u.includes('instagram') ? { icon: '📸', label: 'Instagram' }
                          : u.includes('facebook') || u.includes('fb.com') ? { icon: '📘', label: 'Facebook' }
                          : u.includes('linkedin') ? { icon: '💼', label: 'LinkedIn' }
                          : u.includes('tiktok') ? { icon: '🎵', label: 'TikTok' }
                          : u.includes('youtube') ? { icon: '▶️', label: 'YouTube' }
                          : { icon: '🌐', label: 'Profile' };
                        return { ...p, url: selectedLead.social_url! };
                      })(),
                    ].filter(Boolean) as { icon: string; label: string; url: string }[];
                    const seen = new Set<string>();
                    const socials = raw.filter((s) => !seen.has(s.url) && seen.add(s.url));
                    return (
                      <div className="pb-1">
                        <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1.5">🔗 Socials</div>
                        {socials.length === 0 ? (
                          <p className="text-zinc-600 text-xs">No social link yet — add one below.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {socials.map((s, i) => (
                              <a key={i} href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-blue-600/20 border border-zinc-700 hover:border-blue-500/40 text-zinc-200 hover:text-white text-sm font-medium transition-colors">
                                <span>{s.icon}</span>{s.label}<span className="opacity-40 text-xs">↗</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Editable text fields */}
                  {([
                    ['Email', 'email', 'email'],
                    ['Phone', 'phone', 'tel'],
                    ['Revenue Level', 'revenue_level', 'text'],
                  ] as [string, keyof Lead, string][]).map(([label, field, type]) => (
                    <div key={field} className="grid grid-cols-2 gap-2 items-center">
                      <span className="text-zinc-500 text-xs uppercase tracking-wide">{label}</span>
                      <input
                        type={type}
                        defaultValue={(selectedLead[field] as string) ?? ''}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val !== (selectedLead[field] ?? '')) {
                            void handleInlineEdit(selectedLead.id, field as string, val);
                            setSelectedLead((p) => p ? { ...p, [field]: val } : p);
                          }
                        }}
                        className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
                      />
                    </div>
                  ))}

                  {/* Quality dropdown */}
                  <div className="grid grid-cols-2 gap-2 items-center">
                    <span className="text-zinc-500 text-xs uppercase tracking-wide">Quality</span>
                    <select
                      value={selectedLead.quality ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        void handleInlineEdit(selectedLead.id, 'quality', val);
                        setSelectedLead((p) => p ? { ...p, quality: val } : p);
                      }}
                      className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
                    >
                      <option value="">— select —</option>
                      {QUALITY_OPTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                    </select>
                  </div>

                  {/* Offer pitched */}
                  <div className="grid grid-cols-2 gap-2 items-center">
                    <span className="text-zinc-500 text-xs uppercase tracking-wide">🎯 Offer pitched</span>
                    <select
                      value={selectedLead.offer_brief_id ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        void handleInlineEdit(selectedLead.id, 'offer_brief_id', val);
                        setSelectedLead((p) => p ? { ...p, offer_brief_id: val || null } : p);
                      }}
                      className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-100 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
                    >
                      <option value="">— which offer —</option>
                      {offerBriefs.map((o) => <option key={o.id} value={o.id}>{o.emoji} {o.name}</option>)}
                    </select>
                  </div>

                  {/* Setter */}
                  <TeamPicker
                    label="Setter"
                    role="setter"
                    value={selectedLead.setter}
                    members={teamMembers}
                    onSelect={(v) => {
                      void handleInlineEdit(selectedLead.id, 'setter', v);
                      setSelectedLead((p) => p ? { ...p, setter: v } : p);
                    }}
                    onAddMember={handleAddTeamMember}
                  />

                  {/* Sales Person */}
                  <TeamPicker
                    label="Sales Person"
                    role="salesperson"
                    value={selectedLead.sales_person}
                    members={teamMembers}
                    onSelect={(v) => {
                      void handleInlineEdit(selectedLead.id, 'sales_person', v);
                      setSelectedLead((p) => p ? { ...p, sales_person: v } : p);
                    }}
                    onAddMember={handleAddTeamMember}
                  />

                  {/* Read-only dates */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Opt-In Date</div>
                      <div className="text-zinc-300 text-sm">{selectedLead.opt_in_date ? new Date(selectedLead.opt_in_date).toLocaleDateString() : '—'}</div>
                    </div>
                    <div>
                      <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Last Update</div>
                      <div className="text-zinc-300 text-sm">{selectedLead.last_update ? new Date(selectedLead.last_update).toLocaleDateString() : '—'}</div>
                    </div>
                  </div>

                  {/* Social links — editable */}
                  <div className="pt-2 border-t border-zinc-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-zinc-400 text-xs uppercase tracking-wide">Social Profiles</div>
                      <button
                        onClick={handleFindSocials}
                        disabled={findingSocials}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 rounded-lg text-xs font-medium text-blue-300 transition-colors disabled:opacity-50"
                      >
                        {findingSocials ? (
                          <>
                            <span className="inline-block w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                            Searching...
                          </>
                        ) : (
                          <>🔍 Find Socials</>
                        )}
                      </button>
                    </div>
                    {socialsFound && Object.values(socialsFound).every(v => !v) && (
                      <div className="text-xs text-zinc-500 mb-2">No profiles found — try adding their name manually.</div>
                    )}
                    {([
                      ['🌐 Primary / Facebook', 'social_url'],
                      ['📸 Instagram', 'instagram_url'],
                      ['💼 LinkedIn', 'linkedin_url'],
                      ['📘 Facebook (alt)', 'facebook_url'],
                    ] as [string, keyof Lead][]).map(([label, field]) => (
                      <div key={field} className="mb-2">
                        <div className="text-zinc-500 text-xs mb-0.5">{label}</div>
                        <input
                          type="url"
                          defaultValue={(selectedLead[field] as string) ?? ''}
                          placeholder="https://..."
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val !== (selectedLead[field] ?? '')) {
                              void handleInlineEdit(selectedLead.id, field as string, val);
                              setSelectedLead((p) => p ? { ...p, [field]: val } : p);
                            }
                          }}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-blue-400 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-500"
                        />
                        {(selectedLead[field] as string) && (
                          <a href={selectedLead[field] as string} target="_blank" rel="noopener noreferrer" className="text-[10px] text-zinc-600 hover:text-zinc-400 truncate block mt-0.5">
                            ↗ open
                          </a>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-zinc-800 text-zinc-500 text-xs">
                    Source: {selectedLead.source ?? '—'}
                  </div>
                </div>
              )}

              {/* ── CONTEXT TAB — conversation screenshots + what to say next ── */}
              {panelTab === 'context' && <LeadContextPanel leadId={selectedLead.id} />}

              {/* ── MESSAGE TAB ── */}
              {panelTab === 'message' && (
                <div className="p-4 flex flex-col gap-4">
                  <div className="flex gap-2">
                    {(['sms', 'email'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setMessageTab(t)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          messageTab === t ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {t === 'sms' ? '💬 SMS' : '📧 Email'}
                      </button>
                    ))}
                  </div>
                  {messageTab === 'email' && (
                    <input
                      type="text"
                      placeholder="Subject..."
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                    />
                  )}
                  <textarea
                    placeholder={messageTab === 'sms' ? 'Type your SMS...' : 'Type your email...'}
                    value={messageTab === 'sms' ? smsMessage : emailMessage}
                    onChange={(e) => messageTab === 'sms' ? setSmsMessage(e.target.value) : setEmailMessage(e.target.value)}
                    rows={5}
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600 resize-none"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={sending || !(messageTab === 'sms' ? smsMessage : emailMessage)}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                  >
                    {sending ? 'Sending...' : `Send ${messageTab === 'sms' ? 'SMS' : 'Email'}`}
                  </button>
                  {selectedLead.ongoing_message_feed && (
                    <div>
                      <div className="text-zinc-500 text-xs uppercase tracking-wide mb-2">Message History</div>
                      <pre className="bg-zinc-800/50 rounded-lg p-3 text-xs text-zinc-300 whitespace-pre-wrap font-mono overflow-auto max-h-60">
                        {selectedLead.ongoing_message_feed}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* ── NOTES TAB ── */}
              {panelTab === 'notes' && (
                <div className="p-4 flex flex-col gap-4">
                  {/* New note composer */}
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleAddNote();
                      }}
                      rows={4}
                      placeholder="Add a note… (⌘↵ to save)"
                      className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                    />
                    <button
                      onClick={handleAddNote}
                      disabled={savingNote || !newNote.trim()}
                      className="py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors"
                    >
                      {savingNote ? 'Saving…' : '+ Add Note'}
                    </button>
                  </div>

                  {/* Notes list */}
                  <div className="space-y-2">
                    {notesLoading && (
                      <div className="text-center py-4 text-zinc-500 text-xs">Loading…</div>
                    )}
                    {!notesLoading && notes.length === 0 && (
                      <div className="text-center py-6 text-zinc-600 text-sm">No notes yet</div>
                    )}
                    {notes.map((note) => {
                      const d = new Date(note.created_at);
                      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                      return (
                        <div key={note.id} className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-3 group">
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="text-[11px] text-zinc-500 font-medium">
                              {dateStr} · {timeStr}
                            </div>
                            <button
                              onClick={() => void handleDeleteNote(note.id)}
                              className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all text-xs leading-none flex-shrink-0"
                              title="Delete note"
                            >
                              ×
                            </button>
                          </div>
                          <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">{note.text}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── AI TAB ── */}
              {panelTab === 'ai' && (
                <div className="p-4 flex flex-col gap-4">
                  {/* Generate button */}
                  <div className="text-center">
                    <p className="text-zinc-500 text-xs mb-3">
                      Add social profiles in the Info tab to get a better analysis. AI uses quality score, revenue level, notes, and all social links.
                    </p>
                    <button
                      onClick={handleRunAi}
                      disabled={aiLoading}
                      className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-60 rounded-xl text-sm font-semibold transition-all shadow-lg"
                    >
                      {aiLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Researching {selectedLead.full_name?.split(' ')[0]}...
                        </span>
                      ) : aiResult ? '🔄 Regenerate Analysis' : '🤖 Generate AI Prospect Report'}
                    </button>
                  </div>

                  {aiError && (
                    <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 text-red-400 text-sm">{aiError}</div>
                  )}

                  {aiResult && (
                    <div className="space-y-4 text-sm">
                      {/* Temperature badge */}
                      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
                        aiResult.temperature === 'hot' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' :
                        aiResult.temperature === 'warm' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' :
                        'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      }`}>
                        {aiResult.temperature === 'hot' ? '🔥 HOT LEAD' : aiResult.temperature === 'warm' ? '♨️ WARM LEAD' : '❄️ COLD LEAD'}
                        <span className="opacity-60">·</span>
                        <span className="opacity-80">Recommend: {aiResult.recommended_offer}</span>
                      </div>

                      {/* Profile overview */}
                      <div className="bg-zinc-800/60 rounded-xl p-4 space-y-2 border border-zinc-700/40">
                        <div className="text-zinc-400 text-xs uppercase tracking-wide">Profile</div>
                        <div><span className="text-zinc-500 text-xs">Niche:</span> <span className="text-zinc-200">{aiResult.niche}</span></div>
                        <div><span className="text-zinc-500 text-xs">Est. Revenue:</span> <span className="text-emerald-300 font-medium">{aiResult.estimated_revenue}</span></div>
                        <div className="text-zinc-300 text-xs leading-relaxed pt-1">{aiResult.personality_read}</div>
                      </div>

                      {/* Pain points & goals side by side */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-zinc-800/60 rounded-xl p-3 border border-zinc-700/40">
                          <div className="text-zinc-400 text-xs uppercase tracking-wide mb-2">Pain Points</div>
                          <ul className="space-y-1">
                            {aiResult.pain_points.map((p, i) => (
                              <li key={i} className="text-xs text-zinc-300 flex gap-1.5"><span className="text-red-400 mt-0.5">•</span>{p}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="bg-zinc-800/60 rounded-xl p-3 border border-zinc-700/40">
                          <div className="text-zinc-400 text-xs uppercase tracking-wide mb-2">Goals & Desires</div>
                          <ul className="space-y-1">
                            {aiResult.goals_desires.map((g, i) => (
                              <li key={i} className="text-xs text-zinc-300 flex gap-1.5"><span className="text-emerald-400 mt-0.5">•</span>{g}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* DM message — the hero */}
                      <div className="bg-gradient-to-br from-violet-900/40 to-blue-900/40 border border-violet-500/30 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-violet-300 text-xs uppercase tracking-wide font-semibold">📨 Send This DM</div>
                          <div className="text-zinc-500 text-xs">{aiResult.dm_platform}</div>
                        </div>
                        <p className="text-zinc-100 text-sm leading-relaxed">{aiResult.dm_message}</p>
                        <button
                          onClick={() => {
                            void navigator.clipboard.writeText(aiResult.dm_message);
                            setDmCopied(true);
                            setTimeout(() => setDmCopied(false), 2000);
                          }}
                          className="w-full py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-xs font-semibold transition-colors"
                        >
                          {dmCopied ? '✓ Copied!' : 'Copy DM'}
                        </button>
                      </div>

                      {/* Follow-up angle */}
                      <div className="bg-zinc-800/60 rounded-xl p-3 border border-zinc-700/40">
                        <div className="text-zinc-400 text-xs uppercase tracking-wide mb-1.5">If No Reply in 3 Days</div>
                        <p className="text-zinc-300 text-xs leading-relaxed">{aiResult.follow_up_angle}</p>
                      </div>

                      {/* Flags & objections */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-zinc-800/60 rounded-xl p-3 border border-zinc-700/40">
                          <div className="text-emerald-400 text-xs uppercase tracking-wide mb-2">Green Flags</div>
                          <ul className="space-y-1">
                            {aiResult.green_flags.map((f, i) => <li key={i} className="text-xs text-zinc-300">✓ {f}</li>)}
                          </ul>
                        </div>
                        <div className="bg-zinc-800/60 rounded-xl p-3 border border-zinc-700/40">
                          <div className="text-red-400 text-xs uppercase tracking-wide mb-2">Watch Out</div>
                          <ul className="space-y-1">
                            {aiResult.red_flags.map((f, i) => <li key={i} className="text-xs text-zinc-300">⚠ {f}</li>)}
                          </ul>
                        </div>
                      </div>

                      {/* Objections */}
                      <div className="bg-zinc-800/60 rounded-xl p-3 border border-zinc-700/40">
                        <div className="text-yellow-400 text-xs uppercase tracking-wide mb-2">Expected Objections</div>
                        <ul className="space-y-1.5">
                          {aiResult.objections_to_expect.map((o, i) => (
                            <li key={i} className="text-xs text-zinc-300 flex gap-1.5"><span className="text-yellow-500">→</span>{o}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
