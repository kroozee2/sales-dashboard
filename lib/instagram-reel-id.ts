import { createHash } from "node:crypto";

function normalizeTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function deterministicReelIdeaId(title: string) {
  const normalized = normalizeTitle(title);
  if (!normalized) throw new Error("Reel title is required");
  const hex = createHash("sha256")
    .update(`salesos:instagram-reel-idea:v1:${normalized}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
