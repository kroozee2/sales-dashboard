import { NextResponse } from "next/server";

const FATHOM_BASE = "https://api.fathom.ai/external/v1";

export async function GET() {
  const key = process.env.FATHOM_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "FATHOM_API_KEY not configured" }, { status: 500 });
  }

  const res = await fetch(`${FATHOM_BASE}/meetings?per_page=8&include_summary=true`, {
    headers: { "X-Api-Key": key, "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Fathom error ${res.status}: ${text}` }, { status: 502 });
  }

  const data = await res.json();
  const meetings: any[] = data.items ?? [];

  const list = meetings.map((m: any) => {
    const invitees: any[] = m.calendar_invitees ?? [];
    const externals = invitees.filter((i: any) => i.is_external);

    // Build a display string: prefer "Name (email)", fall back to just email or name
    const attendeeParts = externals.slice(0, 4).map((i: any) => {
      const name = (i.name ?? "").trim();
      const email = (i.email ?? "").trim();
      if (name && email) return `${name} (${email})`;
      return name || email || "Unknown";
    });
    const attendees = attendeeParts.join(", ") || null;

    const start = m.recording_start_time ? new Date(m.recording_start_time) : null;
    const end = m.recording_end_time ? new Date(m.recording_end_time) : null;
    const durationMin = start && end ? Math.round((end.getTime() - start.getTime()) / 60000) : null;

    // Extract a 1-2 sentence blurb from the summary
    const rawSummary = m.default_summary;
    let blurb: string | null = null;
    if (rawSummary) {
      const text = typeof rawSummary === "string" ? rawSummary : (rawSummary.markdown_formatted ?? rawSummary.text ?? JSON.stringify(rawSummary));
      // Strip markdown headers/bullets, grab first 180 chars of real content
      const clean = text.replace(/^#{1,3}\s.*$/gm, "").replace(/^\s*[-*]\s+/gm, "").replace(/\*\*/g, "").trim();
      const firstChunk = clean.slice(0, 180).trim();
      blurb = firstChunk ? (firstChunk.length < clean.length ? firstChunk + "…" : firstChunk) : null;
    }

    return {
      recording_id: m.recording_id,
      call_id: m.call_id ?? m.id ?? null,
      title: m.title || "Impromptu Meeting",
      date: m.recording_start_time ?? null,
      duration_min: durationMin,
      attendees,
      blurb,
      share_url: m.share_url ?? m.url ?? null,
    };
  });

  return NextResponse.json({ list });
}
