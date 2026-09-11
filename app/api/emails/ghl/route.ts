import { NextRequest, NextResponse } from "next/server";
import { normalize, isSent, totals, type GhlCampaign } from "@/lib/email-campaigns";

// Reads email campaigns straight from GoHighLevel. Nothing is stored: GHL is
// the record of what was sent, and caching it would only let the two drift.

export const runtime = "nodejs";
export const maxDuration = 60;

const GHL = "https://services.leadconnectorhq.com";

export async function GET(req: NextRequest) {
  const key = process.env.GHL_API_KEY;
  const location = process.env.GHL_LOCATION_ID;
  if (!key || !location) {
    return NextResponse.json({ error: "GoHighLevel is not configured." }, { status: 503 });
  }

  const days = Number(req.nextUrl.searchParams.get("days") ?? 90);
  const since = Date.now() - days * 86_400_000;

  try {
    const res = await fetch(`${GHL}/emails/schedule?locationId=${location}&limit=100`, {
      headers: { Authorization: `Bearer ${key}`, Version: "2021-07-28", Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new Error(`GHL ${res.status}`);
    const body = (await res.json()) as { schedules?: Record<string, unknown>[] };

    const all = (body.schedules ?? []).map(normalize);
    const inWindow = all.filter((c) => {
      const t = new Date(c.created_at).getTime();
      return Number.isFinite(t) && t >= since;
    });

    const sent = inWindow.filter(isSent).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const drafts = inWindow.filter((c) => !isSent(c));

    // One point per send, oldest first, for the charts.
    const series = [...sent].reverse().map((c: GhlCampaign) => ({
      date: c.created_at.slice(0, 10),
      name: c.name,
      audience: c.audience,
      delivered: c.delivered,
      not_delivered: c.not_delivered,
      rate: c.delivery_rate === null ? null : Math.round(c.delivery_rate * 1000) / 10,
    }));

    return NextResponse.json({
      window_days: days,
      sent,
      drafts,
      series,
      totals: totals(sent),
      // Said plainly so nobody reads the absence of open rate as a bug.
      note: "GoHighLevel's API exposes delivery only. Opens and clicks are not available through it.",
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[emails/ghl]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "GoHighLevel unreachable." }, { status: 502 });
  }
}
