import { NextResponse } from "next/server";

const GHL_BASE = "https://services.leadconnectorhq.com";
// Andrew's GHL user ID in this location
const ANDREW_USER_ID = "iVqhzUsWWh50xEVW4JRr";

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  attendees: { email: string; name: string }[];
  description?: string;
  location?: string;
  isOneOnOne: boolean;
}

function parseContactName(title: string): string {
  // GHL titles are formatted as "Contact Name | Calendar Name"
  const pipeIdx = title.indexOf("|");
  if (pipeIdx > 0) return title.slice(0, pipeIdx).trim();
  return title.trim();
}

export async function GET() {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID || "ZJQSLWJWH7OVHVrJjmPj";

  if (!apiKey) {
    return NextResponse.json({ events: [], configured: false, message: "GHL_API_KEY not set" });
  }

  const now = new Date();
  const startMs = now.getTime();
  const endMs = now.getTime() + 30 * 24 * 60 * 60 * 1000;

  try {
    const url = new URL(`${GHL_BASE}/calendars/events`);
    url.searchParams.set("locationId", locationId);
    url.searchParams.set("userId", ANDREW_USER_ID);
    url.searchParams.set("startTime", String(startMs));
    url.searchParams.set("endTime", String(endMs));

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: "2021-04-15",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("GHL calendar error", res.status, text.slice(0, 300));
      return NextResponse.json({ events: [], configured: true, error: `GHL ${res.status}` });
    }

    const data = await res.json();
    const ghlEvents: any[] = data.events ?? [];

    const events: CalendarEvent[] = ghlEvents
      .filter((e) => e.appointmentStatus !== "cancelled" && !e.deleted)
      .map((e) => {
        const contactName = parseContactName(e.title ?? "");
        return {
          id: e.id,
          summary: e.title ?? "(no title)",
          start: new Date(e.startTime).toISOString(),
          end: new Date(e.endTime ?? e.startTime).toISOString(),
          attendees: contactName ? [{ email: "", name: contactName }] : [],
          description: undefined,
          location: e.address || undefined,
          isOneOnOne: true,
        };
      });

    events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    return NextResponse.json({ events, configured: true, source: "ghl", total: events.length });
  } catch (err) {
    console.error("Calendar events error:", err);
    return NextResponse.json({ events: [], configured: true, error: String(err) });
  }
}
