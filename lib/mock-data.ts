export const PIPELINE_STAGES = [
  "New",
  "Contacted",
  "Call Booked",
  "Proposal",
  "Closed Won",
  "Closed Lost",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  offer: string;
  stage: PipelineStage;
  value: number;
  notes: string;
  createdAt: string;
  lastContact: string;
}

export interface SalesCall {
  id: string;
  leadName: string;
  phone: string;
  scheduledAt: string;
  duration: number;
  offer: string;
  status: "scheduled" | "completed" | "no-show" | "follow-up";
  notes: string;
}

export interface Offer {
  id: string;
  name: string;
  price: number;
  pricingType: "pif" | "monthly" | "hybrid";
  description: string;
  status: "active" | "inactive" | "coming-soon";
  stripeProductId?: string;
}

export const DEMO_LEADS: Lead[] = [
  {
    id: "lead-1",
    name: "Marcus Webb",
    email: "marcus@marcuswebb.co",
    phone: "+14155552671",
    offer: "BOARDROOM",
    stage: "Call Booked",
    value: 15000,
    notes: "Referred by Franco. Doing $35K/mo, hitting a ceiling. Very motivated.",
    createdAt: "2026-06-08T10:00:00Z",
    lastContact: "2026-06-10T14:30:00Z",
  },
  {
    id: "lead-2",
    name: "Priya Sharma",
    email: "priya@priyasharma.com",
    phone: "+16505553892",
    offer: "BOARDROOM",
    stage: "Proposal",
    value: 15000,
    notes: "Health coach, $28K/mo. Needs offer ecosystem and team structure. Ready to move.",
    createdAt: "2026-06-05T09:00:00Z",
    lastContact: "2026-06-11T11:00:00Z",
  },
  {
    id: "lead-3",
    name: "Derek Fontaine",
    email: "derek@derekfontaine.com",
    phone: "+13125554201",
    offer: "LAUNCH",
    stage: "Contacted",
    value: 9000,
    notes: "Sales professional transitioning to coaching. Has a small email list. Warm DM lead.",
    createdAt: "2026-06-11T08:00:00Z",
    lastContact: "2026-06-11T08:00:00Z",
  },
];

export const DEMO_CALLS: SalesCall[] = [
  {
    id: "call-1",
    leadName: "Marcus Webb",
    phone: "+14155552671",
    scheduledAt: "2026-06-13T15:00:00Z",
    duration: 60,
    offer: "BOARDROOM",
    status: "scheduled",
    notes: "Intro call. Review offer ecosystem fit.",
  },
  {
    id: "call-2",
    leadName: "Priya Sharma",
    phone: "+16505553892",
    scheduledAt: "2026-06-12T17:00:00Z",
    duration: 60,
    offer: "BOARDROOM",
    status: "follow-up",
    notes: "She loved the call. Needs to talk to husband. Follow up Friday.",
  },
  {
    id: "call-3",
    leadName: "Ben Rosario",
    phone: "+17025558834",
    scheduledAt: "2026-06-10T14:00:00Z",
    duration: 60,
    offer: "LAUNCH",
    status: "completed",
    notes: "Enrolled at $9K PIF. Stripe payment confirmed.",
  },
  {
    id: "call-4",
    leadName: "Cassie Moore",
    phone: "+15125556612",
    scheduledAt: "2026-06-14T16:00:00Z",
    duration: 60,
    offer: "BOARDROOM",
    status: "scheduled",
    notes: "Inbound from Skool community. $40K/mo agency owner.",
  },
];

export const DEMO_OFFERS: Offer[] = [
  {
    id: "offer-launch",
    name: "7-Figure CEO LAUNCH",
    price: 9000,
    pricingType: "hybrid",
    description: "For coaches at $5K–$20K/month building to consistent $30K months. Tribe of Buyers + offer ecosystem + minimal viable team.",
    status: "active",
  },
  {
    id: "offer-boardroom",
    name: "7-Figure CEO BOARDROOM",
    price: 15000,
    pricingType: "pif",
    description: "For coaches at $20K+/month hitting a ceiling. Lean 7-figure team, streamlined content, offer ecosystem. Scale past $100K/month.",
    status: "active",
  },
  {
    id: "offer-workshop",
    name: "Claude AI Sales Mastermind",
    price: 497,
    pricingType: "pif",
    description: "Live 1-day intensive. AI-powered sales systems for coaches. Austin, TX — May 30.",
    status: "active",
  },
];

export const DEMO_REVENUE_DATA = {
  weekly: [
    { label: "May 12", revenue: 24000, calls: 3 },
    { label: "May 19", revenue: 15000, calls: 2 },
    { label: "May 26", revenue: 9000, calls: 1 },
    { label: "Jun 2", revenue: 30000, calls: 4 },
    { label: "Jun 9", revenue: 15000, calls: 2 },
  ],
  monthly: [
    { label: "Feb", revenue: 45000, calls: 6 },
    { label: "Mar", revenue: 60000, calls: 8 },
    { label: "Apr", revenue: 75000, calls: 9 },
    { label: "May", revenue: 93000, calls: 11 },
    { label: "Jun", revenue: 45000, calls: 5 },
  ],
  quarterly: [
    { label: "Q3 2025", revenue: 185000, calls: 24 },
    { label: "Q4 2025", revenue: 210000, calls: 28 },
    { label: "Q1 2026", revenue: 195000, calls: 26 },
    { label: "Q2 2026", revenue: 213000, calls: 28 },
  ],
  yearly: [
    { label: "2023", revenue: 520000, calls: 72 },
    { label: "2024", revenue: 680000, calls: 91 },
    { label: "2025", revenue: 810000, calls: 107 },
    { label: "2026 YTD", revenue: 408000, calls: 54 },
  ],
};

export const DEMO_TRANSACTIONS = [
  { id: "txn-1", name: "Ben Rosario", offer: "LAUNCH", amount: 9000, date: "2026-06-10", status: "succeeded" },
  { id: "txn-2", name: "Alicia Torres", offer: "BOARDROOM", amount: 15000, date: "2026-06-07", status: "succeeded" },
  { id: "txn-3", name: "Claude AI Mastermind", offer: "Workshop", amount: 3976, date: "2026-06-05", status: "succeeded" },
  { id: "txn-4", name: "Ryan Kessler", offer: "BOARDROOM", amount: 15000, date: "2026-06-01", status: "succeeded" },
  { id: "txn-5", name: "Nina Patel", offer: "LAUNCH", amount: 1000, date: "2026-05-28", status: "succeeded" },
  { id: "txn-6", name: "David Cho", offer: "BOARDROOM", amount: 15000, date: "2026-05-22", status: "succeeded" },
  { id: "txn-7", name: "Sarah Bloom", offer: "LAUNCH", amount: 9000, date: "2026-05-19", status: "succeeded" },
  { id: "txn-8", name: "James Ortiz", offer: "BOARDROOM", amount: 15000, date: "2026-05-15", status: "succeeded" },
];
