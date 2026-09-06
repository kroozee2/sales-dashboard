import { NextResponse } from "next/server";
import { fetchClientsUpstream, validateClientRange } from "@/lib/clients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function GET(request: Request) {
  const range = validateClientRange(new URL(request.url).searchParams);
  if (!range) return json({ error: "Use a valid from/to range of up to 124 inclusive days." }, 400);

  const result = await fetchClientsUpstream(range, {
    base: process.env.HELM_SALESOS_URL,
    secret: process.env.HELM_SALESOS_SECRET,
  });
  if (!result.ok) {
    return result.status === 503
      ? json({ error: "Client data connection is not configured." }, 503)
      : json({ error: "Client data is temporarily unavailable." }, 502);
  }
  return json(result.payload);
}
