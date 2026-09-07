'use client';

import { useState, useEffect, useRef } from 'react';

interface Field {
  key: string;
  label: string;
  placeholder: string;
  type?: 'text' | 'password' | 'url';
  hint?: string;
}

interface Integration {
  id: string;
  name: string;
  emoji: string;
  description: string;
  fields: Field[];
  docUrl?: string;
  docLabel?: string;
  openUrl?: string;
  openLabel?: string;
}

const INTEGRATIONS: Integration[] = [
  {
    id: 'anthropic',
    name: 'Claude AI (Anthropic)',
    emoji: '🤖',
    description: 'Powers the AI assistant tab — lead research, message drafting, and voice commands.',
    docUrl: 'https://console.anthropic.com/settings/keys',
    docLabel: 'Get API key →',
    fields: [
      { key: 'ANTHROPIC_API_KEY', label: 'API Key', placeholder: 'sk-ant-...', type: 'password' },
    ],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    emoji: '💳',
    description: 'Fills the Revenue dashboard with payments, subscriptions, and MRR data.',
    docUrl: 'https://dashboard.stripe.com/apikeys',
    docLabel: 'Get API key →',
    openUrl: 'https://dashboard.stripe.com',
    openLabel: 'Open Stripe →',
    fields: [
      { key: 'STRIPE_SECRET_KEY', label: 'Secret Key', placeholder: 'sk_live_...', type: 'password' },
    ],
  },
  {
    id: 'ghl',
    name: 'GoHighLevel',
    emoji: '⚡',
    description: 'CRM integration — link leads to contacts, search by name, and send messages.',
    docUrl: 'https://marketplace.gohighlevel.com/oauth/chooselocation',
    docLabel: 'Create API key →',
    openUrl: 'https://app.gohighlevel.com',
    openLabel: 'Open GHL →',
    fields: [
      { key: 'GHL_API_KEY', label: 'API Key', placeholder: 'Paste your GHL private API key', type: 'password' },
      { key: 'GHL_LOCATION_ID', label: 'Location ID', placeholder: 'e.g. ZJQSLWJWH7OVHVrJjmPj', type: 'text', hint: 'Found in GHL → Settings → Business Info' },
    ],
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    emoji: '📅',
    description: 'Imports your 1-on-1 and group calls into the Sales Calls tab.',
    docUrl: 'https://support.google.com/calendar/answer/37648',
    docLabel: 'How to get your iCal URL →',
    openUrl: 'https://calendar.google.com',
    openLabel: 'Open Google Calendar →',
    fields: [
      {
        key: 'GOOGLE_CALENDAR_ICAL_URL',
        label: 'Secret iCal URL',
        placeholder: 'https://calendar.google.com/calendar/ical/.../basic.ics',
        type: 'url',
        hint: 'Calendar settings → "Secret address in iCal format"',
      },
    ],
  },
];

type Status = 'idle' | 'saving' | 'testing' | 'ok' | 'error';

interface CardState {
  values: Record<string, string>;
  dirty: boolean;
  saveStatus: Status;
  testStatus: Status;
  testMessage: string;
  saveMessage: string;
}

function redact(val: string): string {
  if (!val || val.length < 8) return val;
  return val.slice(0, 4) + '••••••••' + val.slice(-4);
}

export default function SettingsPage() {
  const [cards, setCards] = useState<Record<string, CardState>>(() =>
    Object.fromEntries(
      INTEGRATIONS.map((i) => [i.id, { values: {}, dirty: false, saveStatus: 'idle', testStatus: 'idle', testMessage: '', saveMessage: '' }])
    )
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const saveLocks = useRef(new Set<string>());
  const testLocks = useRef(new Set<string>());

  useEffect(() => {
    fetch('/api/settings')
      .then(async (response) => {
        const data = await response.json() as { settings?: Record<string, string>; error?: string };
        if (!response.ok || !data.settings) throw new Error(data.error || 'Settings could not be loaded.');
        return data.settings;
      })
      .then((stored) => {
        setCards((prev) => {
          const next = { ...prev };
          for (const intg of INTEGRATIONS) {
            const vals: Record<string, string> = {};
            for (const f of intg.fields) {
              vals[f.key] = stored[f.key] ?? '';
            }
            next[intg.id] = { ...prev[intg.id], values: vals };
          }
          return next;
        });
      })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Settings could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const updateField = (intgId: string, key: string, val: string) => {
    setCards((prev) => ({
      ...prev,
      [intgId]: { ...prev[intgId], values: { ...prev[intgId].values, [key]: val }, dirty: true, saveStatus: 'idle', saveMessage: '', testStatus: 'idle', testMessage: '' },
    }));
  };

  const save = async (intg: Integration) => {
    if (saveLocks.current.has(intg.id)) return;
    saveLocks.current.add(intg.id);
    const submitted = { ...cards[intg.id].values };
    setCards((prev) => ({ ...prev, [intg.id]: { ...prev[intg.id], saveStatus: 'saving', saveMessage: '' } }));
    try {
      const response = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submitted) });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || data.ok !== true) throw new Error(data.error || 'Settings could not be saved.');
      setCards((prev) => ({ ...prev, [intg.id]: { ...prev[intg.id], saveStatus: 'ok', saveMessage: 'Settings saved.', dirty: JSON.stringify(prev[intg.id].values) !== JSON.stringify(submitted) } }));
    } catch (error) {
      setCards((prev) => ({ ...prev, [intg.id]: { ...prev[intg.id], saveStatus: 'error', saveMessage: error instanceof Error ? error.message : 'Settings could not be saved.', dirty: true } }));
    } finally {
      saveLocks.current.delete(intg.id);
    }
  };

  const test = async (intg: Integration) => {
    if (testLocks.current.has(intg.id)) return;
    testLocks.current.add(intg.id);
    const submitted = { ...cards[intg.id].values };
    setCards((prev) => ({ ...prev, [intg.id]: { ...prev[intg.id], testStatus: 'testing', testMessage: '' } }));
    try {
      const response = await fetch('/api/settings/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ integration: intg.id, values: submitted }) });
      const data = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok || typeof data.ok !== 'boolean' || typeof data.message !== 'string') throw new Error(data.error || 'Connection test failed.');
      const testOk = data.ok;
      const testMessage = data.message;
      setCards((prev) => ({ ...prev, [intg.id]: { ...prev[intg.id], testStatus: testOk ? 'ok' : 'error', testMessage } }));
    } catch (error) {
      setCards((prev) => ({ ...prev, [intg.id]: { ...prev[intg.id], testStatus: 'error', testMessage: error instanceof Error ? error.message : 'Connection test failed.' } }));
    } finally {
      testLocks.current.delete(intg.id);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-8 flex items-center gap-3 text-zinc-400">
        <span className="inline-block w-4 h-4 border-2 border-zinc-600 border-t-blue-400 rounded-full animate-spin" />
        Loading settings…
      </div>
    );
  }

  if (loadError) return <div role="alert" className="mx-auto max-w-2xl rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">{loadError}</div>;

  return (
    <div className="max-w-2xl mx-auto py-4 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Connect your accounts. Keys are stored securely in your database — no redeployment needed.
        </p>
      </div>

      {INTEGRATIONS.map((intg) => {
        const card = cards[intg.id];
        const hasValues = Object.values(card.values).some((v) => v.trim());
        const busy = card.saveStatus === 'saving' || card.testStatus === 'testing';

        return (
          <div key={intg.id} className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex min-w-0 flex-col items-stretch gap-3 px-5 py-4 border-b border-zinc-800 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="text-2xl">{intg.emoji}</span>
                <div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="text-white font-semibold text-sm">{intg.name}</h2>
                    {hasValues && card.testStatus === 'ok' && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-900/50 text-green-400 border border-green-800">✓ Connected</span>
                    )}
                    {hasValues && card.testStatus === 'error' && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-900/50 text-red-400 border border-red-800">✗ Failed</span>
                    )}
                  </div>
                  <p className="text-zinc-400 text-xs mt-0.5">{intg.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {intg.openUrl && (
                  <a
                    href={intg.openUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 min-w-11 items-center justify-center text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors whitespace-nowrap"
                  >
                    {intg.openLabel}
                  </a>
                )}
              </div>
            </div>

            {/* Fields */}
            <div className="px-5 py-4 flex flex-col gap-3">
              {intg.fields.map((field) => {
                const val = card.values[field.key] ?? '';
                return (
                  <div key={field.key} className="flex flex-col gap-1">
                    <label htmlFor={`${intg.id}-${field.key}`} className="text-xs font-medium text-zinc-400">{field.label}</label>
                    <input
                      id={`${intg.id}-${field.key}`}
                      disabled={busy}
                      type={field.type === 'password' ? 'password' : 'text'}
                      value={val}
                      onChange={(e) => updateField(intg.id, field.key, e.target.value)}
                      placeholder={val ? redact(val) : field.placeholder}
                      className="min-h-11 w-full bg-zinc-800 border border-zinc-500 rounded-lg px-3 py-2 text-base sm:text-sm text-white placeholder-zinc-400 outline-none focus:border-blue-500 transition-colors font-mono"
                      autoComplete="off"
                      data-1p-ignore
                    />
                    {field.hint && <p className="text-xs text-zinc-400">{field.hint}</p>}
                  </div>
                );
              })}

              {intg.docUrl && (
                <a
                  href={intg.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 min-w-11 items-center px-2 text-xs text-blue-400 hover:text-blue-300 transition-colors self-start"
                >
                  {intg.docLabel}
                </a>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex min-w-0 flex-col items-stretch gap-3 px-5 py-3 border-t border-zinc-800 bg-zinc-950/30 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1 text-xs break-words [overflow-wrap:anywhere]">
                {card.testMessage && <span role={card.testStatus === 'error' ? 'alert' : 'status'} className={`block ${card.testStatus === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{card.testStatus === 'ok' ? '✓ ' : '✗ '}{card.testMessage}</span>}
                {card.saveMessage && <span role={card.saveStatus === 'error' ? 'alert' : 'status'} className={`block ${card.saveStatus === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{card.saveStatus === 'ok' ? '✓ ' : '✗ '}{card.saveMessage}</span>}
              </div>
              <div className="flex items-center justify-end gap-2 sm:shrink-0">
                <button
                  onClick={() => void test(intg)}
                  disabled={busy || !hasValues}
                  className="min-h-11 px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 text-xs font-medium transition-colors"
                >
                  {card.testStatus === 'testing' ? 'Testing…' : 'Test connection'}
                </button>
                <button
                  onClick={() => void save(intg)}
                  disabled={!card.dirty || busy}
                  className="min-h-11 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
                >
                  {card.saveStatus === 'saving' ? 'Saving…' : card.saveStatus === 'ok' ? '✓ Saved' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <p className="text-xs text-zinc-400 text-center pb-4">
        Keys are stored in your Supabase database and never shared. Env variables are used as fallback if no key is saved here.
      </p>
    </div>
  );
}
