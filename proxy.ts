import { NextRequest, NextResponse } from "next/server";

/**
 * Access gate for the whole app.
 *
 * Until 2026-08-07 every page and every /api route on this project was readable
 * by anyone on the internet: no auth, and the API routes talk to Supabase with
 * the service-role key (which bypasses RLS). An anonymous `curl` returned the
 * full leads table, sales calls, tasks and revenue.
 *
 * Two ways in now:
 *   1. Browser  — one password, exchanged for a session cookie at /login.
 *   2. Machine  — `Authorization: Bearer <SALESOS_AGENT_KEY>` on /api/* only,
 *                 so Jarvis (and any other agent) can read/write without a browser.
 *
 * Everything else gets a redirect (pages) or a 401 (api).
 */

const COOKIE = "sos_session";

// Paths that must stay reachable without a session, or login itself can't work.
const PUBLIC_PATHS = ["/login", "/api/auth/login"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Next internals, static assets, PWA manifest/icons.
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico" || pathname === "/manifest.json") return true;
  if (/\.(png|jpg|jpeg|svg|webp|ico|woff2?|ttf|txt|webmanifest)$/.test(pathname)) return true;
  return false;
}

/** Constant-time-ish compare so we don't leak length/prefix via timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const sessionToken = process.env.SALESOS_SESSION_TOKEN;
  const agentKey = process.env.SALESOS_AGENT_KEY;

  // Fail closed. A missing secret must not silently reopen the door.
  if (!sessionToken) {
    return new NextResponse(
      JSON.stringify({ error: "Server misconfigured: SALESOS_SESSION_TOKEN is not set." }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  // 1. Browser session cookie.
  const cookie = req.cookies.get(COOKIE)?.value;
  if (cookie && safeEqual(cookie, sessionToken)) return NextResponse.next();

  // 2. Agent bearer token — API routes only. Never grants page access.
  if (pathname.startsWith("/api/") && agentKey) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth.startsWith("Bearer ") && safeEqual(auth.slice(7).trim(), agentKey)) {
      return NextResponse.next();
    }
  }

  // 3. Denied.
  if (pathname.startsWith("/api/")) {
    return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
