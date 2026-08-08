import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_CALLS_URL!,
  process.env.SUPABASE_CALLS_SERVICE_KEY!
);

// Apify actor per platform
const ACTORS: Record<string, string> = {
  facebook: "apify~facebook-comments-scraper",
  instagram: "apify~instagram-comment-scraper",
};

interface RawComment {
  profileName?: string;
  ownerUsername?: string;
  text?: string;
  profileUrl?: string;
  postTitle?: string;
  date?: string;
  timestamp?: string;
  author?: { name?: string; url?: string };
}

function norm(s: string | null | undefined): string {
  return (s ?? "").replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export async function GET() {
  const { data: posts, error } = await db()
    .from("two_step_posts")
    .select("*, resources(id, title, type, url, value_scripts)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  const { post_url, platform = "facebook", resource_id, post_title } = await req.json() as { post_url: string; platform?: string; resource_id?: string; post_title?: string };
  if (!post_url) return NextResponse.json({ error: "post_url required" }, { status: 400 });

  // Skool can't be scraped — just save the link + the resource we're directing people to
  if (platform === "skool") {
    const today = new Date().toISOString().split("T")[0];
    const { data: post, error } = await db()
      .from("two_step_posts")
      .insert({ platform, post_url, post_title: post_title?.trim() || null, resource_id: resource_id ?? null, commenter_count: 0, status: "todo", posted_at: today })
      .select("*, resources(id, title, type, url, value_scripts)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ post, commenters: 0, matched: 0, created: 0, saved: true });
  }

  const actor = ACTORS[platform] ?? ACTORS.facebook;
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "Apify not configured" }, { status: 500 });

  // Build actor input per platform
  const input = platform === "instagram"
    ? { directUrls: [post_url], resultsLimit: 100 }
    : { startUrls: [{ url: post_url }], resultsLimit: 100, includeNestedComments: false };

  let raw: RawComment[] = [];
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(180000),
      }
    );
    if (!res.ok) throw new Error(`Apify ${res.status}: ${await res.text()}`);
    raw = await res.json() as RawComment[];
  } catch (err) {
    console.error("Two-step scrape error:", err);
    return NextResponse.json({ error: "Scrape failed. Make sure the post is public and the link is correct." }, { status: 502 });
  }

  // Normalize + dedupe commenters
  const postTitle = raw.find((c) => c.postTitle)?.postTitle ?? null;
  const seen = new Set<string>();
  const commenters: { name: string; profile_url: string | null; comment_text: string | null; commented_at: string | null }[] = [];
  for (const c of raw) {
    const name = c.profileName || c.author?.name || c.ownerUsername || "";
    const profileUrl = c.profileUrl || c.author?.url || (c.ownerUsername ? `https://instagram.com/${c.ownerUsername}` : null);
    if (!name.trim()) continue;
    const key = norm(name) + "|" + (profileUrl ?? "");
    if (seen.has(key)) continue;
    seen.add(key);
    commenters.push({
      name: name.trim(),
      profile_url: profileUrl,
      comment_text: c.text?.trim() || null,
      commented_at: c.date || c.timestamp || null,
    });
  }

  const client = db();

  // Approximate the post date from the earliest comment (falls back to today)
  const commentDates = commenters.map((c) => c.commented_at).filter(Boolean) as string[];
  const postedAt = commentDates.length
    ? commentDates.sort()[0].split("T")[0]
    : new Date().toISOString().split("T")[0];

  // Create the post record
  const { data: post, error: postErr } = await client
    .from("two_step_posts")
    .insert({ platform, post_url, post_title: postTitle, resource_id: resource_id ?? null, commenter_count: commenters.length, status: "todo", posted_at: postedAt })
    .select()
    .single();
  if (postErr) return NextResponse.json({ error: postErr.message }, { status: 500 });

  // Match to existing leads (by name) or auto-create as new leads
  const sourceLabel = platform === "instagram" ? "Instagram DM" : "Facebook DM";
  const rows = [];
  for (const c of commenters) {
    let leadId: string | null = null;
    let matched = false;

    const { data: existing } = await client
      .from("leads")
      .select("id")
      .ilike("full_name", c.name)
      .limit(1)
      .maybeSingle();

    if (existing) {
      leadId = existing.id;
      matched = true;
    } else {
      // Auto-create — CTA commenters enter the pipeline per the SOP
      const newId = crypto.randomUUID();
      const { error: insErr } = await client.from("leads").insert({
        id: newId,
        full_name: c.name,
        prospect_stage: "📣 Reached Out",
        source: sourceLabel,
        social_url: c.profile_url,
        facebook_url: platform === "facebook" ? c.profile_url : null,
        instagram_url: platform === "instagram" ? c.profile_url : null,
        notes: `Commented "${c.comment_text ?? "engaged"}" on two-step post${postTitle ? `: ${postTitle.slice(0, 80)}` : ""}`,
        last_update: new Date().toISOString(),
      });
      if (!insErr) leadId = newId;
    }

    rows.push({
      post_id: post.id,
      name: c.name,
      profile_url: c.profile_url,
      comment_text: c.comment_text,
      commented_at: c.commented_at,
      lead_id: leadId,
      matched,
    });
  }

  if (rows.length) await client.from("two_step_commenters").insert(rows);

  return NextResponse.json({
    post,
    commenters: rows.length,
    matched: rows.filter((r) => r.matched).length,
    created: rows.filter((r) => !r.matched && r.lead_id).length,
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json() as {
    id: string; status?: string; posted_at?: string;
    post_title?: string; resource_id?: string | null; platform?: string; post_url?: string;
  };
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.posted_at !== undefined) updates.posted_at = body.posted_at || null;
  if (body.post_title !== undefined) updates.post_title = body.post_title?.trim() || null;
  if (body.resource_id !== undefined) updates.resource_id = body.resource_id || null;
  if (body.platform !== undefined) updates.platform = body.platform;
  if (body.post_url !== undefined) updates.post_url = body.post_url?.trim() || null;

  const { data, error } = await db()
    .from("two_step_posts")
    .update(updates)
    .eq("id", id)
    .select("*, resources(id, title, type, url, value_scripts)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, post: data });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await db().from("two_step_posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
