import { NextRequest, NextResponse } from "next/server";
import { graphicDownloadName } from "@/lib/client-detail";
import {
  ClientMediaTooLargeError,
  MAX_CLIENT_MEDIA_BYTES,
  normalizeClientMediaDownloadSource,
  readBoundedBody,
  verifiedImageMime,
} from "@/lib/client-media-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  const name = (request.nextUrl.searchParams.get("name") ?? "client").slice(0, 200);
  const label = (request.nextUrl.searchParams.get("label") ?? "graphic").slice(0, 100);
  if (!rawUrl) return NextResponse.json({ error: "url is required" }, { status: 400 });

  let source: string;
  try { source = normalizeClientMediaDownloadSource(rawUrl); }
  catch { return NextResponse.json({ error: "That graphic source is not approved" }, { status: 400 }); }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const upstream = await fetch(source, {
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: "image/jpeg,image/png,image/webp" },
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "The graphic could not be downloaded" }, { status: 502 });
    }

    const declaredBytes = Number(upstream.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_CLIENT_MEDIA_BYTES) {
      await upstream.body.cancel("client media exceeds download limit");
      return NextResponse.json({ error: "The graphic is larger than 20 MB" }, { status: 413 });
    }

    let body: Uint8Array;
    try { body = await readBoundedBody(upstream.body); }
    catch (error) {
      if (error instanceof ClientMediaTooLargeError) {
        return NextResponse.json({ error: "The graphic is larger than 20 MB" }, { status: 413 });
      }
      throw error;
    }

    const mime = verifiedImageMime(upstream.headers.get("content-type"), body);
    if (!mime) return NextResponse.json({ error: "The graphic is not a supported image" }, { status: 415 });
    const filename = graphicDownloadName(name, label, mime);

    const payload = new ArrayBuffer(body.byteLength);
    new Uint8Array(payload).set(body);
    return new NextResponse(payload, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(body.byteLength),
        "Content-Type": mime,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "The graphic download timed out or failed" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
