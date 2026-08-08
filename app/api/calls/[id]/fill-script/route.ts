import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { getSetting } from "@/lib/settings";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { transcript } = await req.json();
  if (!transcript) return NextResponse.json({ error: "No transcript provided" }, { status: 400 });

  const supabase = createLeadsAdminClient();

  const { data: sections } = await supabase
    .from("script_sections")
    .select("id, emoji, title, order_index")
    .order("order_index", { ascending: true });

  if (!sections?.length) return NextResponse.json({ filled: [] });

  const apiKey = await getSetting("ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY");
  if (!apiKey) return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 400 });

  const client = new Anthropic({ apiKey });

  const sectionList = sections.map((s) => `- ${s.emoji} ${s.title} (id: ${s.id})`).join("\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: `You are analyzing a sales call transcript to extract relevant excerpts for each section of a sales script.

Sales script sections:
${sectionList}

Transcript:
${transcript.slice(0, 12000)}

For each section, extract the most relevant 2-4 sentences from the transcript that represent what happened in that section. If a section didn't happen or has no relevant content, return an empty string.

Return ONLY a JSON array like this:
[
  {"section_id": "<uuid>", "excerpt": "<relevant transcript excerpt or empty string>"},
  ...
]`,
    }],
  });

  const raw = message.content.find((b) => b.type === "text")?.text ?? "[]";
  let filled: { section_id: string; excerpt: string }[] = [];
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    filled = JSON.parse(jsonMatch?.[0] ?? "[]");
  } catch {
    return NextResponse.json({ filled: [] });
  }

  // Upsert notes for each section that has content
  const upserts = filled
    .filter((f) => f.excerpt?.trim())
    .map((f) =>
      supabase.from("call_section_notes").upsert(
        {
          call_id: id,
          section_id: f.section_id,
          fathom_excerpt: f.excerpt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "call_id,section_id" }
      )
    );

  await Promise.all(upserts);
  return NextResponse.json({ filled: filled.filter((f) => f.excerpt?.trim()).length });
}
