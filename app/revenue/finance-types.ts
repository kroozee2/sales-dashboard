/** Shapes shared by the Finances workspace, its tabs and its UI pieces. */

export interface Transaction {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  offer: string;
  amount: number;
  date: string;
  status: string;
  customerId: string | null;
  createdTs: number;
  isSubscriptionCharge?: boolean;
  receiptUrl?: string | null;
}

export interface GhlContact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  ghlUrl: string;
}

export interface Subscription {
  id: string;
  itemId: string | null;
  priceId: string | null;
  currency: string;
  name: string;
  email: string | null;
  offer: string;
  amount: number;
  monthlyAmount: number;
  interval: string;
  status: "active" | "paused";
  nextBill: string;
  nextBillTs: number | null;
  startDate: string;
  customerId: string | null;
}

export interface RevenueSummary {
  total: number;
  newSalesLowTicket: number;
  newSalesHighTicket: number;
  newSalesLowCount: number;
  newSalesHighCount: number;
  /** Period-scoped — these follow the period selector. */
  lowTicket?: number;
  lowCount?: number;
  highTicket?: number;
  highCount?: number;
  recurringTotal?: number;
  recurringCount?: number;
  customers?: number;
}

export interface RevenueWindowShape {
  gte: number | null;
  lt: number;
  labels: string[];
  /** Bucket boundaries in unix seconds; length = labels.length + 1. */
  edges: number[];
}

export interface PreviousSummary extends RevenueWindowShape {
  label: string;
  total: number;
  lowTicket: number;
  highTicket: number;
  recurringTotal: number;
  count: number;
}

/** One bar of the revenue chart, already split by where the money came from. */
export interface ChartBar {
  label: string;
  revenue: number;
  high?: number;
  low?: number;
  recurring?: number;
  prev?: number | null;
  start?: number;
  end?: number;
}

export interface SubData {
  subscriptions: Subscription[];
  mrr: number;
  totalActive: number;
  totalPaused: number;
}

export interface ManualPayment {
  id: string;
  name: string;
  source: string;
  offer: string | null;
  notes: string | null;
  amount: number;
  payment_type: "one_off" | "recurring";
  payment_date: string | null;
  interval_type: string | null;
  billing_day: number | null;
  start_date: string | null;
  next_bill_date: string | null;
  status: "active" | "paused" | "cancelled" | "scheduled" | "collected";
  phone: string | null;
  email: string | null;
  ghl_contact_id: string | null;
  ghl_url: string | null;
  created_at: string;
}

export interface GhlSearchContact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  ghlUrl: string;
}

export interface PersonPanelState {
  name: string;
  phone: string | null;
  email: string | null;
  ghlUrl: string | null;
  ghlContactId: string | null;
}

export const FINANCE_TABS = [
  { key: "dashboard", label: "Dashboard", emoji: "📊" },
  { key: "sales", label: "Recent Sales", emoji: "🧾" },
  { key: "mrr", label: "MRR", emoji: "🔁" },
  { key: "low", label: "Low Ticket", emoji: "🎟" },
] as const;

export type FinanceTab = (typeof FINANCE_TABS)[number]["key"];

export function isFinanceTab(value: string | null): value is FinanceTab {
  return !!value && FINANCE_TABS.some((t) => t.key === value);
}

/** The $1,000 line that splits a low-ticket purchase from a high-ticket sale. */
export const HIGH_TICKET_FLOOR = 1000;
