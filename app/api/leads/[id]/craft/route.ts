import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY!
);

type IntelCall = { id: string; call_date: string | null; result: string | null; offer: string | null; deal_amount: number | null; objections: string[] | null; follow_up_notes: string | null; ai_summary: string | null };
type IntelPayment = { id: string; amount: number; payment_date: string | null; offer: string | null; status: string; payment_type: string };

async function gatherIntel(lead: { full_name: string | null; email: string | null; phone: string | null }) {
  const client = db();
  const digits = (lead.phone ?? "").replace(/\D/g, "").slice(-10);

  // Sales calls — match by email, phone, or exact-ish name
  const orParts: string[] = [];
  if (lead.email) orParts.push(`email.ilike.${lead.email}`);
  if (digits.length === 10) orParts.push(`phone.ilike.%${digits}%`);
  if (lead.full_name) orParts.push(`name.ilike.${lead.full_name.trim()}`);

  let calls: IntelCall[] = [];
  if (orParts.length) {
    const { data } = await client
      .from("sales_calls")
      .select("id, call_date, result, offer, deal_amount, objections, follow_up_notes, ai_summary")
      .or(orParts.join(","))
      .order("call_date", { ascending: false })
      .limit(5);
    calls = data ?? [];
  }

  // Payments — match by name (manual_payments has no lead link)
  let payments: IntelPayment[] = [];
  if (lead.full_name) {
    const { data } = await client
      .from("manual_payments")
      .select("id, amount, payment_date, offer, status, payment_type")
      .ilike("name", `%${lead.full_name.trim()}%`)
      .order("payment_date", { ascending: false })
      .limit(5);
    payments = data ?? [];
  }

  return { calls, payments };
}

// GET — intel only (panel loads this on open)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data: lead } = await db().from("leads").select("*").eq("id", id).single();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const intel = await gatherIntel(lead);
  return NextResponse.json(intel);
}

// POST — save voice context (optional) + craft a personalized message
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { context } = await req.json() as { context?: string };

  const client = db();
  const { data: lead } = await client.from("leads").select("*").eq("id", id).single();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const [intel, scriptsRes, notesRes] = await Promise.all([
    gatherIntel(lead),
    client.from("dm_scripts").select("category, title, body").eq("active", true),
    client.from("lead_notes").select("text, created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  const scripts = scriptsRes.data ?? [];
  const savedNotes = (notesRes.data ?? [])
    .map((n) => `- [${String(n.created_at).split("T")[0]}] ${n.text}`)
    .join("\n");

  const first = (lead.full_name ?? "").split(" ")[0] || "there";
  const callLines = intel.calls.map((c) =>
    `- ${String(c.call_date ?? "").split("T")[0]}: ${c.result ?? "no result"}${c.offer ? `, offer: ${c.offer}` : ""}${c.deal_amount ? `, deal $${c.deal_amount}` : ""}${c.objections?.length ? `, objections: ${c.objections.join("; ")}` : ""}${c.follow_up_notes ? `, follow-up plan: ${c.follow_up_notes}` : ""}${c.ai_summary ? `\n  summary: ${c.ai_summary.slice(0, 600)}` : ""}`
  );
  const paymentLines = intel.payments.map((p) =>
    `- $${p.amount.toLocaleString()} ${p.status}${p.offer ? ` for ${p.offer}` : ""}${p.payment_date ? ` (${p.payment_date})` : ""}`
  );

  const prompt = `You are the top 0.01% DM setter in the coaching and consulting space, writing ONE personalized message for Andrew Kroeze (7-Figure CEO) to send right now. You provide real value, shift how people think, and aren't afraid to challenge — never salesy, never creepy.

THE PERSON: ${lead.full_name}
Stage: ${lead.prospect_stage ?? "unknown"} · Quality: ${lead.quality ?? "unknown"}${lead.source ? ` · Source: ${lead.source}` : ""}${lead.revenue_level ? ` · Revenue level: ${lead.revenue_level}` : ""}
DM CONVERSATION STAGE: ${lead.dm_stage ?? "not set"}

THE SETTER PROCESS (follow it — the message must fit the conversation stage):
- 👋 Opening: value first, zero pitch, build rapport, get a reply
- 🔍 Probing: permission first ("mind if I ask you 2-3 questions real quick to see if I can even help?"), then current situation → desired situation → bottleneck → urgency. One question at a time.
- 🎯 Transition: 3 steps — ask permission → no-brainer opportunity ("regardless of whether we ever work together") → make the NO a YES ("if that doesn't sound ridiculous to you?"). Default to booking a CALL; if they're colder or a lower-ticket fit, offer the $47 7-day trial instead (https://buy.stripe.com/eVafZgcyN7CXa8UcQA)
- 📅 Booking: offer 2 concrete times, then double-confirm ("is there any reason you might have to cancel?")
- ✅ Confirmed: pre-call homework, resources, warm check-in 24-48h before the call
Booking link if needed: https://api.leadconnectorhq.com/widget/bookings/andrew-kroeze

WHAT ANDREW KNOWS ABOUT THEM (notes, newest first):
${(lead.notes ?? "").slice(0, 2000) || "(no notes)"}

SAVED CONTEXT NOTES (newest first — the most recent ones carry the most weight):
${savedNotes || "(none)"}

${context?.trim() ? `FRESH UNSAVED CONTEXT (weight this heaviest — it's what he wants the message built around):\n${context.trim()}\n` : ""}
SALES CALL HISTORY:
${callLines.length ? callLines.join("\n") : "(no calls on record)"}

PAYMENT HISTORY:
${paymentLines.length ? paymentLines.join("\n") : "(no payments on record)"}

RECENT MESSAGES SENT TO THEM (don't repeat these angles):
${(lead.ongoing_message_feed ?? "").slice(0, 800) || "(none logged)"}

SCRIPT LIBRARY FOR INSPIRATION (style reference, don't copy verbatim):
${scripts.slice(0, 12).map((s) => `- [${s.category}] ${s.body}`).join("\n")}

ANDREW'S TEXTING VOICE (non-negotiable):
- Mostly lowercase, no period at the end of the final line
- NO em dashes ever. Use "..." or commas.
- Sparse emoji, max one (💪 🙏 😏)
- NEVER: "amazing", "definitely", "absolutely", "totally", "guru", "hustle", "crush it", "guaranteed", "just following up", "checking in"
- One question mark max per message
- Sounds like a sharp friend, not a marketer

THE CRAFT:
- Be SPECIFIC to this person: reference what they're building, what they said, their objection, their payment situation — whichever is most alive right now
- Specific without creepy: reference things they told Andrew or did together (calls, payments), never scraped facts
- Lead with them, ask ONE genuinely good question that moves their thinking
- If they owe a payment or a pay link is pending, weave the next step in naturally, no pressure
- If there was an objection on their call, address it with a reframe or proof, not a rebuttal
- 1-4 short sentences. This is a text/DM, not an email.

Respond ONLY as JSON, no markdown:
{"message": "the message, ready to send, using ${first} for their name (not a placeholder)", "why": "one sentence on the play you chose", "alt": "one alternate message taking a different angle"}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json() as { content: Array<{ type: string; text?: string }> };
    const text = data.content?.find((b) => b.type === "text")?.text?.trim() ?? "";
    if (!text) throw new Error("Empty model response");
    const parsed = JSON.parse(text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()) as { message: string; why: string; alt: string };
    return NextResponse.json({ ...parsed, intel });
  } catch (err) {
    console.error("Craft message error:", err);
    return NextResponse.json({ error: "Failed to craft message" }, { status: 500 });
  }
}
