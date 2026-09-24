import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import { fetchManifest, parseSkillMarkdown, skillUrls, type SkillRow, type SkillSource } from "@/lib/skills-catalog";

// Pulls the skills repo into Supabase so the Skills tab loads instantly instead
// of making 84 GitHub requests every time somebody opens it.
//
// GitHub rate-limits unauthenticated requests to 60 an hour, and raw.github
// is separate and far more generous, so the SKILL.md files are read from raw
// and the manifest supplies the list. Requests go out in small batches to stay
// polite rather than firing 84 at once.

export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH = 8;

function authorised(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  const agent = process.env.SALESOS_AGENT_KEY;
  if (secret && header === `Bearer ${secret}`) return true;
  if (agent && header === `Bearer ${agent}`) return true;
  if (!secret && req.headers.get("user-agent")?.includes("vercel-cron") === true) return true;
  // A signed-in person pressing Refresh is already past the app's own gate.
  return req.headers.get("x-requested-with") === "sales-os-ui";
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    const manifest = await fetchManifest();
    const entries: { source: SkillSource; name: string; path: string }[] = [];
    for (const source of ["claude", "hermes"] as SkillSource[]) {
      for (const item of manifest.skills?.[source] ?? []) {
        if (item?.name && item?.path) entries.push({ source, name: item.name, path: item.path });
      }
    }
    if (entries.length === 0) return NextResponse.json({ error: "Manifest listed no skills." }, { status: 502 });

    const rows: SkillRow[] = [];
    for (let i = 0; i < entries.length; i += BATCH) {
      const slice = entries.slice(i, i + BATCH);
      const read = await Promise.all(slice.map(async (entry) => {
        const urls = skillUrls(entry.path);
        try {
          const res = await fetch(urls.raw_url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
          const markdown = res.ok ? await res.text() : "";
          const { description, trigger } = parseSkillMarkdown(markdown);
          return { ...entry, ...urls, description, trigger_hint: trigger, body_chars: markdown.length };
        } catch {
          // A skill that cannot be read still belongs in the list, with its link.
          return { ...entry, ...urls, description: null, trigger_hint: null, body_chars: 0 };
        }
      }));
      rows.push(...read);
    }

    const db = createLeadsAdminClient();
    const { error } = await db.from("agent_skills").upsert(
      rows.map((r) => ({ ...r, synced_at: new Date().toISOString() })),
      { onConflict: "source,name" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const described = rows.filter((r) => r.description).length;
    return NextResponse.json({
      ok: true,
      synced: rows.length,
      with_description: described,
      by_source: {
        claude: rows.filter((r) => r.source === "claude").length,
        hermes: rows.filter((r) => r.source === "hermes").length,
      },
      generated_at: manifest.generated_at ?? null,
    });
  } catch (e) {
    console.error("[skills/sync]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed." }, { status: 502 });
  }
}

export async function GET(req: NextRequest) { return POST(req); }
