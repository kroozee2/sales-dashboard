// Email performance, read from GoHighLevel.
//
// What GHL's API actually gives us: delivery. Every schedule record carries
// totalCount (who it was aimed at), successCount (who it reached) and failed.
// It does NOT carry opens, clicks, bounces or unsubscribes — those endpoints
// return 404 on this account. So this file reports reach honestly and leaves
// engagement to the optional hand-entered figures on the plan row.
//
// "failed" is GHL's own word and it lumps together several reasons a contact
// was skipped: unsubscribed, invalid address, DND, previously bounced. We call
// it "not delivered" rather than guessing which.

export type GhlCampaign = {
  id: string;
  name: string;
  subject: string | null;
  status: string;          // complete | draft | active
  campaign_type: string;   // send_now | schedule_later | draft
  created_at: string;
  scheduled_at: string | null;
  domain: string | null;
  audience: number;        // totalCount
  delivered: number;       // successCount
  not_delivered: number;   // failed
  delivery_rate: number | null; // null when nothing was attempted
};

type Raw = Record<string, unknown>;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function normalize(raw: Raw): GhlCampaign {
  const audience = num(raw.totalCount);
  const delivered = num(raw.successCount ?? raw.success);
  return {
    id: String(raw.id ?? raw._id ?? ""),
    name: String(raw.name ?? "").trim() || "Untitled campaign",
    subject: (raw.subject as string) || null,
    status: String(raw.status ?? "unknown"),
    campaign_type: String(raw.campaignType ?? ""),
    created_at: String(raw.createdAt ?? ""),
    scheduled_at: (raw.dateScheduled as string) || null,
    domain: (raw.selectedDomain as string) || null,
    audience,
    delivered,
    not_delivered: num(raw.failed),
    delivery_rate: audience > 0 ? delivered / audience : null,
  };
}

/** Only campaigns that actually went out. Drafts have no performance to report. */
export const isSent = (c: GhlCampaign) => c.status === "complete" && c.audience > 0;

export type Totals = {
  campaigns: number;
  audience: number;
  delivered: number;
  not_delivered: number;
  delivery_rate: number | null;
  avg_delivered: number | null;
  largest_send: number;
  /** Average days between sends. Null until there are two to compare. */
  cadence_days: number | null;
};

export function totals(sent: GhlCampaign[]): Totals {
  const audience = sent.reduce((n, c) => n + c.audience, 0);
  const delivered = sent.reduce((n, c) => n + c.delivered, 0);
  const dates = sent
    .map((c) => new Date(c.created_at).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  let cadence: number | null = null;
  if (dates.length > 1) {
    const span = dates[dates.length - 1] - dates[0];
    cadence = Math.round(span / (dates.length - 1) / 86_400_000);
  }
  return {
    campaigns: sent.length,
    audience,
    delivered,
    not_delivered: sent.reduce((n, c) => n + c.not_delivered, 0),
    delivery_rate: audience > 0 ? delivered / audience : null,
    avg_delivered: sent.length > 0 ? Math.round(delivered / sent.length) : null,
    largest_send: sent.reduce((n, c) => Math.max(n, c.delivered), 0),
    cadence_days: cadence,
  };
}

export const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
