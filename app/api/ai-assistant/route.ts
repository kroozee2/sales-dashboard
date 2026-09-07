import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createLeadsAdminClient } from '@/lib/supabase-leads';
import { callsDb } from '@/lib/supabase-calls';
import { parseJarvisRequest, readBoundedJarvisBody } from '@/lib/jarvis';
import { boundedText, buildBoundedObservationBody, serializeValidatedReadToolResult, summarizeReadResult } from '@/lib/jarvis-observations';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const GHL_BASE = 'https://services.leadconnectorhq.com';
const LOCATION_ID = process.env.GHL_LOCATION_ID || 'ZJQSLWJWH7OVHVrJjmPj';

function ghlHeaders() {
  return { Authorization: `Bearer ${process.env.GHL_API_KEY}`, 'Content-Type': 'application/json', Version: '2021-07-28' };
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_recent_leads',
    description: 'List the 8 most recently created leads in descending creation order.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'search_leads',
    description: 'Search existing leads in the dashboard by name, email, or phone number.',
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string', description: 'Name, email, or phone to search' } },
      required: ['query'],
    },
  },
  {
    name: 'search_ghl',
    description: 'Search GoHighLevel CRM for a contact by name, email, or phone. Returns their contact info.',
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'find_socials',
    description: 'Find Facebook, Instagram, and LinkedIn profiles for a person by name and/or email.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'list_recent_sales_calls',
    description: 'List the 8 most recent sales calls in descending call-date order.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'search_sales_calls',
    description: 'Search sales call records by prospect name.',
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'list_fathom_recordings',
    description: 'List the 8 most recent Fathom call recordings so you can match one to a sales call.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'generate_message',
    description: 'Craft a personalized outreach message from Andrew to a lead. Returns the draft message text.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        platform: { type: 'string', description: 'Instagram DM, Facebook DM, iMessage, WhatsApp, email, etc.' },
        context: { type: 'string', description: 'What you know about the person and what angle Andrew wants to take' },
        social_url: { type: 'string' },
      },
      required: ['name', 'context'],
    },
  },
];

type ActionLog = { tool: string; label: string; detail?: string; ok?: boolean };

const READ_ONLY_NOTICE = 'Read-only result. No SalesOS records were changed.';
function safeGeneratedContent(items: { type: string; label: string; content: string }[]) {
  const valid = items.filter((item) => item?.type === 'message_draft' && typeof item.content === 'string')
    .map((item) => ({ type: 'message_draft' as const, label: 'AI-generated message draft, not sent' as const, content: boundedText(item.content, 4000) }));
  return { items: valid.slice(0, 10), omitted: Math.max(0, valid.length - 10) };
}

// A tool call succeeded unless its result or label signals failure
function toolSucceeded(result: string, label: string): boolean {
  if (/^(Error|DB error|Fathom error|Fathom error:|Unknown tool)/i.test(result.trim())) return false;
  if (/\b(fail|failed|error|exception)\b/i.test(label)) return false;
  return true;
}

async function readBoundedJson(response: Response, maxBytes = 1_000_000): Promise<unknown> {
  if (!response.body) throw new Error('empty response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new Error('response too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

async function executeTool(name: string, input: Record<string, unknown>, sameOriginHeaders: Record<string, string>, sameOriginBase: string): Promise<{ result: string; log: ActionLog }> {
  if (WRITE_TOOLS.has(name)) return { result: 'Error: Jarvis data changes are disabled until durable idempotency and approval controls are available.', log: { tool: name, label: `Blocked write tool: ${name}`, detail: 'Read-only release' } };
  const supabaseLeads = createLeadsAdminClient();

  switch (name) {
    case 'list_recent_leads': {
      const { data, error } = await supabaseLeads.from('leads').select('id, full_name, prospect_stage, quality, source, notes, ghl_contact_id, created_at').order('created_at', { ascending: false }).limit(8);
      if (error) return { result: `Error: lead source unavailable`, log: { tool: name, label: 'Recent lead lookup failed' } };
      return { result: serializeValidatedReadToolResult(name, data ?? []), log: { tool: name, label: 'Listed newest leads', detail: `${data?.length ?? 0} found` } };
    }

    case 'search_leads': {
      const q = input.query as string;
      const { data, error } = await supabaseLeads.from('leads').select('id, full_name, email, phone, prospect_stage, quality, source, notes, ghl_contact_id').or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`).limit(5);
      if (error) return { result: `Error: lead source unavailable`, log: { tool: name, label: 'Lead search failed' } };
      return { result: serializeValidatedReadToolResult(name, data ?? []), log: { tool: name, label: `Searched leads for "${q}"`, detail: `${data?.length ?? 0} found` } };
    }

    case 'create_lead': {
      const { data, error } = await supabaseLeads.from('leads').insert({ id: crypto.randomUUID(), ...(input as object), opt_in_date: new Date().toISOString(), last_update: new Date().toISOString() }).select().single();
      if (error) return { result: `Error: ${error.message}`, log: { tool: name, label: 'Failed to create lead', detail: error.message } };
      return { result: JSON.stringify(data), log: { tool: name, label: `Created lead: ${input.full_name as string}`, detail: (input.prospect_stage as string) ?? '' } };
    }

    case 'update_lead': {
      const { id, ...updates } = input as { id: string } & Record<string, unknown>;
      const { data, error } = await supabaseLeads.from('leads').update({ ...updates, last_update: new Date().toISOString() }).eq('id', id).select().single();
      if (error) return { result: `Error: ${error.message}`, log: { tool: name, label: 'Failed to update lead', detail: error.message } };
      return { result: JSON.stringify(data), log: { tool: name, label: `Updated lead`, detail: Object.keys(updates).join(', ') } };
    }

    case 'add_lead_note': {
      const { lead_id, text } = input as { lead_id: string; text: string };
      const { data, error } = await supabaseLeads.from('lead_notes').insert({ lead_id, text }).select().single();
      if (error) return { result: `Error: ${error.message}`, log: { tool: name, label: 'Failed to add note', detail: error.message } };
      await supabaseLeads.from('leads').update({ last_update: new Date().toISOString() }).eq('id', lead_id);
      return { result: JSON.stringify(data), log: { tool: name, label: 'Added note to lead' } };
    }

    case 'search_ghl': {
      const q = input.query as string;
      try {
        const res = await fetch(`${GHL_BASE}/contacts/?locationId=${LOCATION_ID}&query=${encodeURIComponent(q)}&limit=5`, { headers: ghlHeaders() });
        if (!res.ok) return { result: 'Error: GHL source unavailable', log: { tool: name, label: 'GHL search failed', detail: `HTTP ${res.status}` } };
        const data = await readBoundedJson(res) as { contacts?: unknown };
        if (!data || !Array.isArray(data.contacts)) return { result: 'Error: invalid GHL response', log: { tool: name, label: 'GHL search failed', detail: 'Invalid response' } };
        return { result: serializeValidatedReadToolResult(name, data.contacts), log: { tool: name, label: `Searched GHL for "${q}"`, detail: `${Math.min(data.contacts.length, 5)} found` } };
      } catch (err) {
        return { result: `Error: ${String(err)}`, log: { tool: name, label: 'GHL search failed' } };
      }
    }

    case 'find_socials': {
      try {
        const res = await fetch(new URL('/api/leads/find-socials', sameOriginBase), {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...sameOriginHeaders }, redirect: 'error',
          body: JSON.stringify({ name: input.name, email: input.email, phone: input.phone }),
        });
        if (!res.ok) return { result: 'Error: social lookup unavailable', log: { tool: name, label: 'Social search failed', detail: `HTTP ${res.status}` } };
        const raw = await readBoundedJson(res);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { result: 'Error: invalid social response', log: { tool: name, label: 'Social search failed', detail: 'Invalid response' } };
        const source = raw as Record<string, unknown>;
        return { result: serializeValidatedReadToolResult(name, source), log: { tool: name, label: `Found social profiles for ${input.name as string}`, detail: ['facebook_url', 'instagram_url', 'linkedin_url'].filter((key) => typeof source[key] === 'string' && source[key]).join(', ') || 'none found' } };
      } catch (err) {
        return { result: `Error: ${String(err)}`, log: { tool: name, label: 'Social search failed' } };
      }
    }

    case 'list_recent_sales_calls': {
      const { data, error } = await callsDb.from('sales_calls').select('id, name, call_date, result, deal_amount, objections, objections_notes, call_notes, recording_url, offer').order('call_date', { ascending: false }).limit(8);
      if (error) return { result: 'Error: sales call source unavailable', log: { tool: name, label: 'Recent sales-call lookup failed' } };
      return { result: serializeValidatedReadToolResult(name, data ?? []), log: { tool: name, label: 'Listed recent sales calls', detail: `${data?.length ?? 0} found` } };
    }

    case 'search_sales_calls': {
      const q = (input.query as string).toLowerCase();
      const { data, error } = await callsDb.from('sales_calls').select('id, name, call_date, result, deal_amount, objections, objections_notes, call_notes, recording_url, offer').ilike('name', `%${q}%`).limit(5);
      if (error) return { result: 'Error: sales call source unavailable', log: { tool: name, label: 'Sales-call search failed' } };
      return { result: serializeValidatedReadToolResult(name, data ?? []), log: { tool: name, label: `Searched calls for "${input.query as string}"`, detail: `${data?.length ?? 0} found` } };
    }

    case 'update_sales_call': {
      const { id, ...updates } = input as { id: string } & Record<string, unknown>;
      const { data, error } = await callsDb.from('sales_calls').update(updates).eq('id', id).select().single();
      if (error) return { result: `Error: ${error.message}`, log: { tool: name, label: 'Failed to update sales call', detail: error.message } };
      return { result: JSON.stringify(data), log: { tool: name, label: `Updated sales call`, detail: Object.keys(updates).join(', ') } };
    }

    case 'list_fathom_recordings': {
      try {
        const res = await fetch(new URL('/api/fathom/list', sameOriginBase), { headers: sameOriginHeaders, redirect: 'error' });
        if (!res.ok) return { result: 'Error: Fathom source unavailable', log: { tool: name, label: 'Fathom list failed', detail: `HTTP ${res.status}` } };
        const data = await readBoundedJson(res);
        if (!data || typeof data !== 'object' || Array.isArray(data)) return { result: 'Error: invalid Fathom response', log: { tool: name, label: 'Fathom list failed', detail: 'Invalid response' } };
        const envelope = data as Record<string, unknown>;
        if (Object.keys(envelope).sort().join(',') !== 'list,more_available,omitted' || !Array.isArray(envelope.list) || envelope.list.length > 8 || !Number.isSafeInteger(envelope.omitted) || Number(envelope.omitted) < 0 || Number(envelope.omitted) > 92 || typeof envelope.more_available !== 'boolean') return { result: 'Error: invalid Fathom response', log: { tool: name, label: 'Fathom list failed', detail: 'Invalid response' } };
        return { result: serializeValidatedReadToolResult(name, { items: envelope.list, omitted: envelope.omitted, more_available: envelope.more_available }), log: { tool: name, label: 'Listed recent Fathom recordings', detail: `${envelope.list.length} shown${Number(envelope.omitted) ? `, ${String(envelope.omitted)} omitted from this page` : ''}${envelope.more_available ? ', later pages available' : ''}` } };
      } catch (err) {
        return { result: `Error: ${String(err)}`, log: { tool: name, label: 'Fathom list failed' } };
      }
    }

    case 'sync_fathom_to_call': {
      const { call_id, recording_id, title, date, share_url } = input as { call_id: string; recording_id: number; title?: string; date?: string; share_url?: string };
      try {
        const syncRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/fathom/sync`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recording_id, title, date, share_url }),
        });
        const syncData = await syncRes.json() as { extracted?: Record<string, unknown>; error?: string };
        if (syncData.error) return { result: `Fathom error: ${syncData.error}`, log: { tool: name, label: 'Fathom sync failed', detail: syncData.error } };

        const extracted = syncData.extracted ?? {};
        const callUpdates: Record<string, unknown> = {};
        if (extracted.result) callUpdates.result = extracted.result;
        if (extracted.showed !== undefined) callUpdates.showed = extracted.showed;
        if (extracted.offer_made !== undefined) callUpdates.offer_made = extracted.offer_made;
        if (extracted.offer) callUpdates.offer = extracted.offer;
        if (extracted.success !== undefined) callUpdates.success = extracted.success;
        if (extracted.deal_amount) callUpdates.deal_amount = extracted.deal_amount;
        if (extracted.cc_upfront) callUpdates.cc_upfront = extracted.cc_upfront;
        if (extracted.monthly_revenue) callUpdates.monthly_revenue = extracted.monthly_revenue;
        if (extracted.enrollment_date) callUpdates.enrollment_date = extracted.enrollment_date;
        if (extracted.follow_up_date) callUpdates.follow_up_date = extracted.follow_up_date;
        if (extracted.objections) callUpdates.objections = extracted.objections;
        if (extracted.objections_notes) callUpdates.objections_notes = extracted.objections_notes;
        if (extracted.call_notes) callUpdates.call_notes = extracted.call_notes;
        if (extracted.follow_up_notes) callUpdates.follow_up_notes = extracted.follow_up_notes;
        if (extracted.ai_summary) callUpdates.ai_summary = extracted.ai_summary;
        if (share_url) callUpdates.recording_url = share_url;

        const { data, error } = await callsDb.from('sales_calls').update(callUpdates).eq('id', call_id).select().single();
        if (error) return { result: `DB error: ${error.message}`, log: { tool: name, label: 'Fathom synced but DB update failed', detail: error.message } };
        return { result: JSON.stringify(data), log: { tool: name, label: 'Synced Fathom recording to call', detail: `Result: ${String(extracted.result ?? 'unknown')}` } };
      } catch (err) {
        return { result: `Error: ${String(err)}`, log: { tool: name, label: 'Fathom sync exception' } };
      }
    }

    case 'generate_message': {
      const msgRes = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `You are writing a personal outreach DM from Andrew Kroeze (7-Figure CEO coach) to ${input.name as string} on ${(input.platform as string) ?? 'Instagram DM'}.

Context: ${input.context as string}
${input.social_url ? `Profile: ${input.social_url as string}` : ''}

Andrew's style: Direct, warm, no hype words ("crush it", "grind"), no em dashes, short paragraphs, ends with a genuine question. No pitching on first contact — spark curiosity.

Write ONLY the message text, nothing else.`,
        }],
      });
      const message = (msgRes.content.find((b: { type: string }) => b.type === 'text') as { text?: string } | undefined)?.text ?? '';
      return { result: message, log: { tool: name, label: `Drafted outreach message for ${input.name as string}`, detail: (input.platform as string) ?? 'DM' } };
    }

    default:
      return { result: 'Unknown tool', log: { tool: name, label: `Unknown tool: ${name}` } };
  }
}

export async function POST(req: NextRequest) {
  let parsedRequest;
  try {
    parsedRequest = parseJarvisRequest(await readBoundedJarvisBody(req));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid command.' }, { status: 400 });
  }
  const { transcript, history } = parsedRequest;
  const cookie = req.headers.get('cookie');
  const sameOriginHeaders: Record<string, string> = cookie ? { Cookie: cookie } : {};
  const sameOriginBase = req.nextUrl.origin;

  const systemPrompt = `You are Jarvis, the AI operator inside Andrew Kroeze's 7-Figure CEO Sales OS. Andrew runs a coaching business — programs: BOARDROOM ($15K) and LAUNCH ($9K). His CRM is GoHighLevel, leads are tracked in a Supabase database, sales calls are recorded on Fathom.

Your job in this release is read-only analysis, research, and drafting. Use search tools to ground every factual answer.
- Never create, update, sync, or add notes to records. Write tools are intentionally unavailable until durable idempotency and approval controls are implemented.
- If Andrew asks for a data change, inspect the relevant record when useful, then state clearly that no mutation was performed and describe the exact proposed change.
- You may draft messages, but never send them.
- Never invent an id or claim a change occurred.
- If a record is missing or the request is ambiguous, say so plainly.

Pipeline stages: 👨 Prospect, 📣 Reached Out, 📞 Call Booked, 🔥 Hot Prospect, 🔗 Pay Link Sent, 🏦 Payment Received
Quality options: 🔥 Very High, ⭐️ High, 👌 Medium, 🤏 Low, ❌ Very Low, 🏝️ Event Lead
Common sources: Facebook Group, Instagram DM, Live Event, Referral, Skool, YouTube, LinkedIn

When someone says "Flow Mastermind" or "event" → source = "Live Event". When they say "DM" → usually Instagram DM or Facebook DM.

After completing all actions, respond with ONLY a JSON object (no markdown, no prose before or after):
{
  "summary": "plain summary grounded in records you inspected. If Andrew requested a mutation, say that no change was made in this read-only release and describe the proposed change.",
  "generatedContent": [{ "type": "message_draft", "label": "Outreach message for Name", "content": "..." }]
}
Only include generatedContent when you generated a message or other copyable text. The summary must describe what the tools actually did, not intentions.`;

  const messages: Anthropic.MessageParam[] = [
    ...history.map((message) => ({ role: message.role, content: message.content }) as Anthropic.MessageParam),
    { role: 'user', content: transcript },
  ];

  const actionLog: ActionLog[] = [];
  const generatedContent: { type: string; label: string; content: string }[] = [];
  const observations: string[] = [];
  let omittedObservations = 0;
  let finalSummary = '';
  let iterations = 0;

  try {
    while (iterations < 10) {
      iterations++;
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 2000,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock[];
        messages.push({ role: 'assistant', content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of toolUseBlocks) {
          let result: string;
          let log: ActionLog;
          try {
            ({ result, log } = await executeTool(block.name, block.input as Record<string, unknown>, sameOriginHeaders, sameOriginBase));
          } catch (error) {
            result = `Error: ${error instanceof Error ? error.message : 'read-tool result validation failed'}`;
            log = { tool: block.name, label: `${block.name} failed`, detail: 'Result validation failed' };
          }
          log.ok = toolSucceeded(result, log.label);
          actionLog.push(log);
          const observation = log.ok ? summarizeReadResult(block.name, result) : null;
          if (observation) {
            if (observations.length < 10) observations.push(boundedText(observation, 2000));
            else omittedObservations += 1;
          }
          if (block.name === 'generate_message' && result && log.ok) {
            generatedContent.push({
              type: 'message_draft',
              label: 'AI-generated message draft, not sent',
              content: result,
            });
          }
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result, is_error: !log.ok });
        }
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      // end_turn (or any non-tool stop): parse the final JSON summary
      const textBlock = response.content.find((b) => b.type === 'text') as { text: string } | undefined;
      if (textBlock?.text) {
        try {
          const match = textBlock.text.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]) as { summary?: string; generatedContent?: { type: string; label: string; content: string }[] };
            finalSummary = parsed.summary ?? '';
            // Model-authored artifacts are never trusted; only server-created tool artifacts are returned.
          } else {
            finalSummary = textBlock.text.trim().slice(0, 300);
          }
        } catch {
          finalSummary = textBlock.text.trim().slice(0, 300);
        }
      }
      break;
    }
  } catch (err) {
    console.error('[ai-assistant] Agent request failed', err);
    const safeDrafts = safeGeneratedContent(generatedContent);
    return NextResponse.json({
      status: 'error',
      actionLog,
      summary: `${READ_ONLY_NOTICE} I could not reach the AI engine. Check the Anthropic configuration and try again.`,
      readOnly: true,
      mutationNotice: READ_ONLY_NOTICE,
      generatedContent: safeDrafts.items,
      generatedContentOmitted: safeDrafts.omitted,
      changed: 0,
      failed: Math.max(1, actionLog.filter((l) => l.ok === false).length),
    });
  }

  // Truth-based status — derived from what the tools actually did, not the model's claim
  const failed = actionLog.filter((l) => l.ok === false).length;
  const ranAny = actionLog.length > 0;
  const status: 'done' | 'partial' | 'nothing' | 'error' =
    ranAny && failed === actionLog.length ? 'error' : failed > 0 ? 'partial' : ranAny ? 'done' : 'nothing';

  const observationBody = buildBoundedObservationBody(observations, omittedObservations);
  finalSummary = observations.length
    ? `${READ_ONLY_NOTICE}\n\n${observationBody}`
    : status === 'error'
      ? `${READ_ONLY_NOTICE} The requested lookup failed, so no unverified result is displayed. See Completed activity for the failed source.`
      : ranAny
        ? `${READ_ONLY_NOTICE} Completed ${actionLog.length} read-only drafting step${actionLog.length === 1 ? '' : 's'}. Review any labelled draft below.`
      : `${READ_ONLY_NOTICE} No validated read result or draft was produced. Try rephrasing the request.`;

  const safeDrafts = safeGeneratedContent(generatedContent);
  return NextResponse.json({ status, changed: 0, failed, actionLog, summary: finalSummary, readOnly: true, mutationNotice: READ_ONLY_NOTICE, generatedContent: safeDrafts.items, generatedContentOmitted: safeDrafts.omitted });
}

// Tools that mutate data (used to count real changes for the "done" confirmation)
const WRITE_TOOLS = new Set(['create_lead', 'update_lead', 'add_lead_note', 'update_sales_call', 'sync_fathom_to_call']);
