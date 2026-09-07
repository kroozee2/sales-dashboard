import { NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

const CFF_URL = process.env.CFF_ADMIN_URL || "https://uthfoencykibvfytkalw.supabase.co/functions/v1/admin";
const SKOOL_URL = process.env.SKOOL_ADMIN_URL || "https://skool-graphics-generator.vercel.app/api/admin/signups";
const FLOW_URL = process.env.FLOW_SIGNUPS_URL || "https://rruzgmiauexvbxspkyuz.supabase.co/functions/v1/signups";

export type SignupApp = "claude" | "skool" | "flow";

export interface Signup {
  id: string;
  app: SignupApp;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  last_seen: string | null;
  login_count: number | null;
  already_lead: boolean;
}

// Claude for Founders — via its admin edge function (name, email, phone)
async function fetchClaude(): Promise<Omit<Signup, "already_lead">[]> {
  const pw = process.env.CFF_ADMIN_PASSWORD;
  if (!pw) return [];
  const res = await fetch(CFF_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-password": pw },
    body: JSON.stringify({ action: "list", table: "leads" }),
    cache: "no-store",
  });
  const json = await res.json() as { data?: Record<string, unknown>[]; error?: string };
  if (json.error) throw new Error(json.error);
  return (json.data ?? []).map((r) => ({
    id: `claude:${String(r.id)}`,
    app: "claude" as const,
    name: (r.name as string) ?? null,
    email: (r.email as string) ?? null,
    phone: (r.phone as string) ?? null,
    created_at: (r.created_at as string) ?? null,
    last_seen: (r.last_seen as string) ?? null,
    login_count: (r.login_count as number) ?? null,
  }));
}

// Skool Monetization Blueprint — via its admin route (name, email; no phone)
async function fetchSkool(): Promise<Omit<Signup, "already_lead">[]> {
  const secret = process.env.SKOOL_ADMIN_SECRET;
  if (!secret) return [];
  const res = await fetch(SKOOL_URL, { headers: { "x-admin-secret": secret }, cache: "no-store" });
  const json = await res.json() as { users?: Record<string, unknown>[]; error?: string };
  if (json.error) throw new Error(json.error);
  return (json.users ?? []).map((u) => ({
    id: `skool:${String(u.id)}`,
    app: "skool" as const,
    name: (u.name as string) ?? null,
    email: (u.email as string) ?? null,
    phone: null,
    created_at: (u.createdAt as string) ?? null,
    last_seen: (u.lastSeen as string) ?? null,
    login_count: (u.loginCount as number) ?? null,
  }));
}

// Flow / Partnership — via its signups edge function (Supabase Auth; email + last login, no phone)
async function fetchFlow(): Promise<Omit<Signup, "already_lead">[]> {
  const secret = process.env.FLOW_ADMIN_SECRET;
  if (!secret) return [];
  const res = await fetch(FLOW_URL, { headers: { "x-admin-secret": secret }, cache: "no-store" });
  const json = await res.json() as { users?: Record<string, unknown>[]; error?: string };
  if (json.error) throw new Error(json.error);
  return (json.users ?? []).map((u) => ({
    id: `flow:${String(u.id)}`,
    app: "flow" as const,
    name: (u.name as string) ?? null,
    email: (u.email as string) ?? null,
    phone: null,
    created_at: (u.createdAt as string) ?? null,
    last_seen: (u.lastSeen as string) ?? null,
    login_count: null,
  }));
}

// GET — pull signups from every app and flag which are already in our Leads
export async function GET() {
  const [claude, skool, flow] = await Promise.allSettled([fetchClaude(), fetchSkool(), fetchFlow()]);
  const rows: Omit<Signup, "already_lead">[] = [];
  const errors: string[] = [];
  if (claude.status === "fulfilled") rows.push(...claude.value);
  else errors.push(`Claude for Founders: ${claude.reason?.message ?? "unreachable"}`);
  if (skool.status === "fulfilled") rows.push(...skool.value);
  else errors.push(`Skool: ${skool.reason?.message ?? "unreachable"}`);
  if (flow.status === "fulfilled") rows.push(...flow.value);
  else errors.push(`Partnership: ${flow.reason?.message ?? "unreachable"}`);

  // Which emails already exist in our Leads?
  const emails = rows.map((r) => (r.email ?? "").toLowerCase()).filter(Boolean);
  const existing = new Set<string>();
  if (emails.length) {
    const db = createLeadsAdminClient();
    const { data } = await db.from("leads").select("email").in("email", emails);
    for (const l of data ?? []) if (l.email) existing.add(String(l.email).toLowerCase());
  }

  const signups: Signup[] = rows
    .map((r) => ({ ...r, already_lead: existing.has((r.email ?? "").toLowerCase()) }))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  return NextResponse.json({ signups, errors: errors.length ? errors : undefined });
}
