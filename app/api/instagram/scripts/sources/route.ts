import { NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What a new script can be built from: a Reel idea already on the Ideas board,
 * or a post we model.
 *
 * Both lists feed the "Start from" panel in the Scripts sidebar, so they are
 * fetched together rather than making the page wait on two round trips.
 * Modelled posts are ordered by views because the whole point of modelling is
 * to copy the structure of what actually worked.
 */

export interface ScriptSourceIdea {
  id: string;
  title: string;
  category: string | null;
  shootDate: string | null;
  stage: string | null;
}

export interface ScriptSourceModelPost {
  id: string;
  handle: string;
  hook: string | null;
  theme: string | null;
  views: number | null;
  postUrl: string | null;
  inMyVoice: string | null;
}

export async function GET() {
  const db = contentDb();

  const [ideasResult, postsResult] = await Promise.all([
    db
      .from("content_items")
      .select("id, title, category, scheduled_date, meta")
      .eq("meta->>reel_workflow", "idea_board")
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("model_posts")
      .select("id, handle, hook, theme, views, post_url, in_my_voice")
      .not("hook", "is", null)
      .order("views", { ascending: false, nullsFirst: false })
      .limit(120),
  ]);

  // A failure on one side should not blank the other. The sidebar shows
  // whichever list it got and says so, rather than looking empty.
  const ideas: ScriptSourceIdea[] = (ideasResult.data ?? []).map((row) => {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    return {
      id: row.id as string,
      title: (row.title as string) ?? "Untitled idea",
      category: (row.category as string) ?? null,
      shootDate: (row.scheduled_date as string) ?? null,
      stage: typeof meta.reel_stage === "string" ? meta.reel_stage : null,
    };
  });

  const modelPosts: ScriptSourceModelPost[] = (postsResult.data ?? []).map((row) => ({
    id: row.id as string,
    handle: (row.handle as string) ?? "",
    hook: (row.hook as string) ?? null,
    theme: (row.theme as string) ?? null,
    views: typeof row.views === "number" ? row.views : null,
    postUrl: (row.post_url as string) ?? null,
    inMyVoice: (row.in_my_voice as string) ?? null,
  }));

  return NextResponse.json({
    ideas,
    modelPosts,
    errors: {
      ideas: ideasResult.error ? "Reel ideas could not be loaded" : null,
      modelPosts: postsResult.error ? "Modelled posts could not be loaded" : null,
    },
  });
}
