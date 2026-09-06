import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { currentMember, USER_COOKIE } from "@/lib/team-auth";

function same(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function bearer(req: NextRequest) {
  const authorization = req.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

export function isHotLeadsAgent(req: NextRequest) {
  return same(bearer(req), process.env.SALESOS_AGENT_KEY ?? "");
}

export function isHotLeadsWorker(req: NextRequest) {
  return same(bearer(req), process.env.INSTAGRAM_HOT_LEADS_WORKER_KEY ?? "");
}

export async function isHotLeadsOwner(req: NextRequest) {
  const member = await currentMember(req.cookies.get(USER_COOKIE)?.value);
  return member?.active === true && member.role === "owner";
}
