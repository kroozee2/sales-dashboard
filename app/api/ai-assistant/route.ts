import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createLeadsAdminClient } from '@/lib/supabase-leads';
import { callsDb } from '@/lib/supabase-calls';
import { parseJarvisRequest } from '@/lib/jarvis';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const GHL_BASE = 'https://services.leadconnectorhq.com';
const LOCATION_ID = process.env.GHL_LOCATION_ID || 'ZJQSLWJWH7OVHVrJjmPj';

function ghlHeaders() {
  return { Authorization: `Bearer ${process.env.GHL_API_KEY}`, 'Content-Type': 'application/json', Version: '2021-07-28' };
}

const TOOLS: Anthropic.Tool[] = [
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
    name: 'create_lead',
    description: 'Create a new lead record in the dashboard.',
    input_schema: {
      type: 'object' as const,
      properties: {
        full_name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        prospect_stage: { type: 'string', description: 'One of: 👨 Prospect, 📣 Reached Out, 📞 Call Booked, 🔥 Hot Prospect, 🔗 Pay Link Sent, 🏦 Payment Received' },
        quality: { type: 'string', description: 'One of: 🔥 Very High, ⭐️ High, 👌 Medium, 🤏 Low, ❌ Very Low, 🏝️ Event Lead' },
        source: { type: 'string', description: 'Where the lead came from (e.g. Facebook Group, Instagram DM, Live Event, Referral, Skool)' },
        notes: { type: 'string' },
        ghl_contact_id: { type: 'string' },
      },
      required: ['full_name'],
    },
  },
  {
    name: 'update_lead',
    description: 'Update fields on an existing lead record.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Lead database ID' },
        full_name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        prospect_stage: { type: 'string' },
        quality: { type: 'string' },
        source: { type: 'string' },
        notes: { type: 'string' },
        ghl_contact_id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'add_lead_note',
    description: 'Add a timestamped note to a lead.',
    input_schema: {
      type: 'object' as const,
      properties: {
        lead_id: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['lead_id', 'text'],
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
    name: 'search_sales_calls',
    description: 'Search sales call records by prospect name.',
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'update_sales_call',
    description: 'Update fields on a sales call record (result, deal amount, objections, notes, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Sales call database ID' },
        result: { type: 'string', description: 'One of: ✅ Sale, 📣 Follow Up, 🔜 Upcoming, ❌ Did Not Close, 👻 No Show' },
        success: { type: 'boolean' },
        deal_amount: { type: 'number' },
        cc_upfront: { type: 'number' },
        monthly_revenue: { type: 'number' },
        objections: { type: 'array', items: { type: 'string' } },
        objections_notes: { type: 'string' },
        call_notes: { type: 'string' },
        follow_up_notes: { type: 'string' },
        fathom_url: { type: 'string' },
        enrollment_date: { type: 'string' },
        follow_up_date: { type: 'string' },
        offer_made: { type: 'boolean' },
        offer: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_fathom_recordings',
    description: 'List the 8 most recent Fathom call recordings so you can match one to a sales call.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'sync_fathom_to_call',
    description: 'Pull a Fathom recording transcript and AI-extract all deal data, then save to a sales call record.',
    input_schema: {
      type: 'object' as const,
      properties: {
        call_id: { type: 'string', description: 'Sales call DB id to update' },
        recording_id: { type: 'number' },
        title: { type: 'string' },
        date: { type: 'string' },
        share_url: { type: 'string' },
      },
      required: ['call_id', 'recording_id'],
    },
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

// A tool call succeeded unless its result or label signals failure
function toolSucceeded(result: string, label: string): boolean {
  if (/^(Error|DB error|Fathom error|Fathom error:|Unknown tool)/i.test(result.trim())) return false;
  if (/\b(fail|failed|error|exception)\b/i.test(label)) return false;
  return true;
}

async function executeTool(name: string, input: Record<string, unknown>): Promise<{ result: string; log: ActionLog }> {
  const supabaseLeads = createLeadsAdminClient();

  switch (name) {
    case 'search_leads': {
      const q = input.query as string;
      const { data } = await supabaseLeads.from('leads').select('id, full_name, email, phone, prospect_stage, quality, source, notes, ghl_contact_id').or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`).limit(5);
      return { result: JSON.stringify(data ?? []), log: { tool: name, label: `Searched leads for "${q}"`, detail: `${data?.length ?? 0} found` } };
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
        const data = await res.json() as { contacts?: Record<string, unknown>[] };
        const toTitle = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
        const contacts = (data.contacts ?? []).map((c) => ({
          id: c.id,
          name: toTitle(`${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || (c.name as string ?? '')),
          email: c.email,
          phone: c.phone,
          tags: c.tags,
        }));
        return { result: JSON.stringify(contacts), log: { tool: name, label: `Searched GHL for "${q}"`, detail: `${contacts.length} found` } };
      } catch (err) {
        return { result: `Error: ${String(err)}`, log: { tool: name, label: 'GHL search failed' } };
      }
    }

    case 'find_socials': {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/leads/find-socials`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: input.name, email: input.email, phone: input.phone }),
        });
        const data = await res.json() as Record<string, string>;
        return { result: JSON.stringify(data), log: { tool: name, label: `Found social profiles for ${input.name as string}`, detail: Object.entries(data).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none found' } };
      } catch (err) {
        return { result: `Error: ${String(err)}`, log: { tool: name, label: 'Social search failed' } };
      }
    }

    case 'search_sales_calls': {
      const q = (input.query as string).toLowerCase();
      const { data } = await callsDb.from('sales_calls').select('id, name, call_date, result, deal_amount, objections, call_notes, fathom_url, offer').ilike('name', `%${q}%`).limit(5);
      return { result: JSON.stringify(data ?? []), log: { tool: name, label: `Searched calls for "${input.query as string}"`, detail: `${data?.length ?? 0} found` } };
    }

    case 'update_sales_call': {
      const { id, ...updates } = input as { id: string } & Record<string, unknown>;
      const { data, error } = await callsDb.from('sales_calls').update(updates).eq('id', id).select().single();
      if (error) return { result: `Error: ${error.message}`, log: { tool: name, label: 'Failed to update sales call', detail: error.message } };
      return { result: JSON.stringify(data), log: { tool: name, label: `Updated sales call`, detail: Object.keys(updates).join(', ') } };
    }

    case 'list_fathom_recordings': {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/fathom/list`);
        const data = await res.json() as { list?: unknown[] };
        return { result: JSON.stringify(data.list ?? []), log: { tool: name, label: 'Listed recent Fathom recordings', detail: `${data.list?.length ?? 0} recordings` } };
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
        if (share_url) callUpdates.fathom_url = share_url;

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
    parsedRequest = parseJarvisRequest(await req.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid command.' }, { status: 400 });
  }
  const { transcript, history } = parsedRequest;

  const systemPrompt = `You are Jarvis, the AI operator inside Andrew Kroeze's 7-Figure CEO Sales OS. Andrew runs a coaching business — programs: BOARDROOM ($15K) and LAUNCH ($9K). His CRM is GoHighLevel, leads are tracked in a Supabase database, sales calls are recorded on Fathom.

Your job: listen to Andrew's command, figure out exactly what he wants, and ACTUALLY DO IT using the tools. This is non-negotiable:
- If the command implies a change (update, create, add note, set stage, log something, sync), you MUST call the tool that performs it. Never just describe what you would do. Never claim something is done without calling the tool that does it.
- To act on an existing record, first search for it (search_leads / search_sales_calls / search_ghl) to get its real database id, THEN call the update tool with that id. Never invent an id.
- Chain tools to fully complete the request in one go (e.g. search_leads → update_lead → add_lead_note).
- Be decisive. Make your best reasonable guess rather than asking for confirmation.
- If you genuinely cannot complete it (record not found, ambiguous), say so plainly in the summary instead of pretending.

Pipeline stages: 👨 Prospect, 📣 Reached Out, 📞 Call Booked, 🔥 Hot Prospect, 🔗 Pay Link Sent, 🏦 Payment Received
Quality options: 🔥 Very High, ⭐️ High, 👌 Medium, 🤏 Low, ❌ Very Low, 🏝️ Event Lead
Common sources: Facebook Group, Instagram DM, Live Event, Referral, Skool, YouTube, LinkedIn

When someone says "Flow Mastermind" or "event" → source = "Live Event". When they say "DM" → usually Instagram DM or Facebook DM.

After completing all actions, respond with ONLY a JSON object (no markdown, no prose before or after):
{
  "summary": "plain confirmation of what you actually changed, naming the record(s). e.g. 'Updated Sarah Kim's stage to Hot Prospect and added your note.' If nothing was changed, say why.",
  "generatedContent": [{ "type": "message_draft", "label": "Outreach message for Name", "content": "..." }]
}
Only include generatedContent when you generated a message or other copyable text. The summary must describe what the tools actually did, not intentions.`;

  const messages: Anthropic.MessageParam[] = [
    ...history.map((message) => ({ role: message.role, content: message.content }) as Anthropic.MessageParam),
    { role: 'user', content: transcript },
  ];

  const actionLog: ActionLog[] = [];
  const generatedContent: { type: string; label: string; content: string }[] = [];
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
          const { result, log } = await executeTool(block.name, block.input as Record<string, unknown>);
          log.ok = toolSucceeded(result, log.label);
          actionLog.push(log);
          if (block.name === 'generate_message' && result && log.ok) {
            generatedContent.push({
              type: 'message_draft',
              label: `Outreach message for ${(block.input as { name?: string }).name ?? 'lead'}`,
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
            if (parsed.generatedContent) generatedContent.push(...parsed.generatedContent);
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
    return NextResponse.json({
      status: 'error',
      actionLog,
      summary: 'I could not reach the AI engine. Check the Anthropic configuration and try again.',
      generatedContent,
      changed: actionLog.filter((l) => l.ok && WRITE_TOOLS.has(l.tool)).length,
      failed: Math.max(1, actionLog.filter((l) => l.ok === false).length),
    });
  }

  // Truth-based status — derived from what the tools actually did, not the model's claim
  const failed = actionLog.filter((l) => l.ok === false).length;
  const changed = actionLog.filter((l) => l.ok && WRITE_TOOLS.has(l.tool)).length;
  const ranAny = actionLog.length > 0;
  const status: 'done' | 'partial' | 'nothing' | 'error' =
    failed > 0 ? 'partial' : ranAny ? 'done' : 'nothing';

  if (!finalSummary) {
    finalSummary = ranAny
      ? actionLog.map((l) => `${l.ok === false ? '✗' : '✓'} ${l.label}`).join('\n')
      : 'No action taken. Try rephrasing what you want done.';
  }

  return NextResponse.json({ status, changed, failed, actionLog, summary: finalSummary, generatedContent });
}

// Tools that mutate data (used to count real changes for the "done" confirmation)
const WRITE_TOOLS = new Set(['create_lead', 'update_lead', 'add_lead_note', 'update_sales_call', 'sync_fathom_to_call']);
