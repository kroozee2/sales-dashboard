// Which calendar a call belongs to.
//
// One booking table (sales_calls) feeds three different calendars, and a call
// belongs to exactly one of them. Change the call's type and it moves — a
// coaching call stops cluttering the sales pipeline and shows up with the
// clients, a connection call lands with the partners.

export type CallLane = "sales" | "client" | "partner";

/** Delivery — these belong on the Client calendar, never the sales pipeline. */
export const CLIENT_CALL_TYPES = ["🧑‍💼 Client Call", "🎓 Coaching Call", "👥 Group Call"] as const;

/** Relationships — these belong on the Partners calendar. */
export const PARTNER_CALL_TYPES = ["🤙 Connection Call", "🤝 Partnership Call", "🤝 JV Call"] as const;

/**
 * Anything that isn't explicitly delivery or a partnership counts as sales,
 * including untyped calls — an unlabelled booking is a lead until told otherwise,
 * and we'd rather see it in the pipeline than lose it.
 */
export function callLane(callType?: string | null): CallLane {
  if (!callType) return "sales";
  if ((CLIENT_CALL_TYPES as readonly string[]).includes(callType)) return "client";
  if ((PARTNER_CALL_TYPES as readonly string[]).includes(callType)) return "partner";
  return "sales";
}

export const isLane = (lane: CallLane) => (c: { call_type?: string | null }) => callLane(c.call_type) === lane;

/** Per-lane copy + defaults, so one workspace can serve all three. */
export const LANE_META: Record<CallLane, { title: string; emoji: string; blurb: string; defaultType: string; accent: string }> = {
  sales: {
    title: "Sales Calls", emoji: "📞",
    blurb: "Powered by Supabase · live data",
    defaultType: "📞 Sales Call",
    accent: "violet",
  },
  client: {
    title: "Client Calls", emoji: "🧑‍💼",
    blurb: "Delivery calls — these also show on the Client calendar",
    defaultType: "🎓 Coaching Call",
    accent: "emerald",
  },
  partner: {
    title: "Partners", emoji: "🤝",
    blurb: "Connection, partnership and JV calls",
    defaultType: "🤙 Connection Call",
    accent: "amber",
  },
};
