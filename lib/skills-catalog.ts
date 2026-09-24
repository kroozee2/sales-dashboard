// The skills Andrew and the agents have built, read from the public repo
// github.com/kroozee2/7figureceoskills.
//
// The repo ships a manifest listing every skill and its path, but the manifest
// carries only a name. What makes a skill sendable to a client is its
// description, and that lives in the frontmatter of each SKILL.md. So the sync
// walks the manifest, reads each file, and stores the pair.

export const SKILLS_REPO = "kroozee2/7figureceoskills";
export const SKILLS_BRANCH = "main";

export type SkillSource = "claude" | "hermes";

export type SkillRow = {
  source: SkillSource;
  name: string;
  path: string;
  description: string | null;
  trigger_hint: string | null;
  html_url: string;
  raw_url: string;
  body_chars: number;
};

type Manifest = {
  generated_at?: string;
  counts?: Record<string, number>;
  skills?: Record<string, { name: string; path: string }[]>;
};

export async function fetchManifest(): Promise<Manifest> {
  const res = await fetch(
    `https://raw.githubusercontent.com/${SKILLS_REPO}/${SKILLS_BRANCH}/skills-manifest.json`,
    { cache: "no-store", signal: AbortSignal.timeout(20_000) },
  );
  if (!res.ok) throw new Error(`skills manifest ${res.status}`);
  return res.json() as Promise<Manifest>;
}

/**
 * Pull the one-line description out of a SKILL.md.
 *
 * Frontmatter descriptions are often several sentences of trigger phrases
 * ("use this whenever the user says..."), which is right for a model and wrong
 * for a card. The first sentence is what a human needs; the rest is kept
 * separately so the card can show it on demand rather than never.
 */
export function parseSkillMarkdown(markdown: string): { description: string | null; trigger: string | null } {
  const fm = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fm) {
    const firstLine = markdown.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#"));
    return { description: firstLine ? firstLine.slice(0, 300) : null, trigger: null };
  }
  const block = fm[1];
  const match = block.match(/^description:\s*(?:>-?\s*\n)?([\s\S]*?)(?=\n[a-zA-Z_-]+:|$)/m);
  if (!match) return { description: null, trigger: null };

  const full = match[1]
    .split("\n").map((l) => l.trim()).filter(Boolean).join(" ")
    .replace(/^["']|["']$/g, "").trim();
  if (!full) return { description: null, trigger: null };

  // Split on the first sentence end that is followed by a capital or a trigger word.
  const cut = full.search(/\.\s+(?=[A-Z(])/);
  if (cut === -1 || cut > 220) return { description: full.slice(0, 260), trigger: full.length > 260 ? full : null };
  return { description: full.slice(0, cut + 1), trigger: full.slice(cut + 1).trim() || null };
}

export function skillUrls(path: string) {
  return {
    html_url: `https://github.com/${SKILLS_REPO}/tree/${SKILLS_BRANCH}/${path}`,
    raw_url: `https://raw.githubusercontent.com/${SKILLS_REPO}/${SKILLS_BRANCH}/${path}/SKILL.md`,
  };
}

/** Title Case from a kebab-case folder name, which is all the repo gives us. */
export function prettySkillName(name: string) {
  return name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
