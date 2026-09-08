import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";

// Who we model on Instagram, and the posts worth modelling.
//
// This replaces a hardcoded list whose handles were real but whose numbers were
// invented — 312k followers for an account that has 157k, post view counts that
// came from nowhere. Everything here is scraped live and stamped with when.
//
// GET    accounts + their posts, with hooks and themes derived
// POST   add an account (then sync it)
// PATCH  sync one account, or all of them
// DELETE remove an account

export const runtime = "nodejs";
export const maxDuration = 300;

const APIFY = "https://api.apify.com/v2/acts";
const POSTS_PER_ACCOUNT = 24;

async function apify(actor: string, input: unknown): Promise<Record<string, unknown>[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not set");
  const res = await fetch(`${APIFY}/${actor}/run-sync-get-dataset-items?token=${token}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(input), cache: "no-store",
  });
  if (!res.ok) throw new Error(`${actor} returned ${res.status}`);
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

// The hook is the first thing they say. Captions bury it after emoji and
// line breaks, so take the first real sentence rather than the first N chars.
export function hookFrom(caption: string | null): string | null {
  if (!caption) return null;
  const firstLine = caption.split(/\n/).map((l) => l.trim()).find((l) => l.length > 12);
  const line = firstLine ?? caption.trim();
  const sentence = line.split(/(?<=[.!?])\s/)[0] ?? line;
  return sentence.slice(0, 180).trim() || null;
}

// The angle, not the topic. Ordered so the more specific pattern wins.
const THEMES: { theme: string; test: RegExp }[] = [
  { theme: "Money claim", test: /\$\s?\d|\d+\s?(k|m)\b|revenue|profit|paid|price|cost|charge|income/i },
  { theme: "Time compression", test: /\bin (under )?\d+\s?(second|minute|hour|day|week)|overnight|instantly|fast/i },
  { theme: "Mistake / warning", test: /mistake|stop (doing|making)|wrong|never|don'?t|avoid|worst|fail/i },
  { theme: "How-to / build", test: /how (i|to)|step|build|set ?up|tutorial|guide|template|workflow|prompt/i },
  { theme: "Contrarian take", test: /nobody|everyone (is|thinks)|unpopular|truth|actually|myth|lie\b/i },
  { theme: "Proof / result", test: /result|case study|client|went from|grew|scaled|\bproof\b/i },
  { theme: "Comment-to-get", test: /comment ["“']?\w+|drop ["“']?\w+|dm me|send you/i },
  { theme: "Personal story", test: /\bi (was|used to|quit|left|started|remember)|my story|years ago/i },
  { theme: "Tool / stack", test: /tool|app|software|stack|claude|chatgpt|ai\b|automation|agent/i },
];

export function themeFrom(caption: string | null): string {
  if (!caption) return "Unclassified";
  for (const t of THEMES) if (t.test.test(caption)) return t.theme;
  return "Unclassified";
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function syncAccount(handle: string) {
  const db = createLeadsAdminClient();

  const [profile] = await apify("apify~instagram-profile-scraper", { usernames: [handle] });
  if (!profile) throw new Error(`no profile for @${handle}`);

  const posts = await apify("apify~instagram-scraper", {
    directUrls: [`https://www.instagram.com/${handle}/`],
    resultsType: "posts", resultsLimit: POSTS_PER_ACCOUNT, addParentData: false,
  });

  const rows = posts
    .filter((p) => p.id)
    .map((p) => {
      const caption = (p.caption as string) ?? null;
      return {
        handle,
        external_id: String(p.id),
        post_url: (p.url as string) ?? `https://www.instagram.com/p/${p.shortCode ?? p.id}/`,
        post_type: (p.type as string) ?? null,
        caption,
        hook: hookFrom(caption),
        theme: themeFrom(caption),
        hashtags: (p.hashtags as string[]) ?? [],
        views: num(p.videoViewCount) ?? num(p.videoPlayCount),
        likes: num(p.likesCount),
        comments: num(p.commentsCount),
        posted_at: (p.timestamp as string) ?? null,
        synced_at: new Date().toISOString(),
      };
    });

  if (rows.length) {
    const { error } = await db.from("model_posts").upsert(rows, { onConflict: "external_id" });
    if (error) throw new Error(error.message);
  }

  const withViews = rows.filter((r) => r.views != null);
  const avgViews = withViews.length
    ? Math.round(withViews.reduce((s, r) => s + (r.views ?? 0), 0) / withViews.length) : null;

  const { error } = await db.from("model_accounts").update({
    name: (profile.fullName as string) ?? null,
    followers: num(profile.followersCount),
    follows: num(profile.followsCount),
    posts_count: num(profile.postsCount),
    avg_views: avgViews,
    synced_at: new Date().toISOString(),
  }).eq("handle", handle);
  if (error) throw new Error(error.message);

  return { handle, posts: rows.length, followers: num(profile.followersCount), avgViews };
}

export async function GET() {
  const db = createLeadsAdminClient();
  const [{ data: accounts, error: aErr }, { data: posts, error: pErr }] = await Promise.all([
    db.from("model_accounts").select("*").eq("active", true).order("followers", { ascending: false, nullsFirst: false }),
    db.from("model_posts").select("*").order("views", { ascending: false, nullsFirst: false }).limit(600),
  ]);
  if (aErr || pErr) return NextResponse.json({ error: (aErr ?? pErr)!.message }, { status: 500 });
  return NextResponse.json({ accounts: accounts ?? [], posts: posts ?? [] });
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { handle?: string; why?: string };
  const handle = (b.handle ?? "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
  if (!handle) return NextResponse.json({ error: "An Instagram handle is required." }, { status: 400 });

  const db = createLeadsAdminClient();
  const { error } = await db.from("model_accounts").upsert({ handle, why: b.why ?? null, active: true }, { onConflict: "handle" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const result = await syncAccount(handle);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // The account is saved either way; the sync can be retried.
    return NextResponse.json({ ok: true, handle, warning: e instanceof Error ? e.message : "Added, but the sync failed." });
  }
}

export async function PATCH(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { handle?: string };
  const db = createLeadsAdminClient();
  const handles = b.handle
    ? [b.handle.replace(/^@/, "")]
    : ((await db.from("model_accounts").select("handle").eq("active", true)).data ?? []).map((r) => r.handle as string);

  const results = await Promise.allSettled(handles.map((h) => syncAccount(h)));
  const synced = results.filter((r) => r.status === "fulfilled").length;
  const failures = results.flatMap((r, i) =>
    r.status === "rejected" ? [{ handle: handles[i], reason: r.reason instanceof Error ? r.reason.message : String(r.reason) }] : []);
  return NextResponse.json({ ok: synced > 0, synced, of: handles.length, failures });
}

export async function DELETE(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { handle?: string };
  if (!b.handle) return NextResponse.json({ error: "handle required" }, { status: 400 });
  const { error } = await createLeadsAdminClient().from("model_accounts").delete().eq("handle", b.handle.replace(/^@/, ""));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
