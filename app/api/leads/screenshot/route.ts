import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const GHL_BASE = "https://services.leadconnectorhq.com";
const LOCATION_ID = process.env.GHL_LOCATION_ID || "ZJQSLWJWH7OVHVrJjmPj";

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };
}

async function searchGHL(name: string) {
  if (!process.env.GHL_API_KEY) return null;
  try {
    const res = await fetch(
      `${GHL_BASE}/contacts/?locationId=${LOCATION_ID}&query=${encodeURIComponent(name)}&limit=3`,
      { headers: ghlHeaders() }
    );
    const data = await res.json() as { contacts?: Record<string, unknown>[] };
    const contacts = data.contacts ?? [];
    if (contacts.length === 0) return null;
    const c = contacts[0];
    return {
      id: c.id as string,
      name: c.firstName ? `${c.firstName as string} ${(c.lastName as string) ?? ""}`.trim() : (c.name as string) ?? "",
      email: (c.email as string) ?? null,
      phone: (c.phone as string) ?? null,
      tags: (c.tags as string[]) ?? [],
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const { imageData, mimeType } = await req.json() as { imageData: string; mimeType: string };

  if (!imageData) {
    return NextResponse.json({ error: "imageData required" }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: (mimeType || "image/png") as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
              data: imageData,
            },
          },
          {
            type: "text",
            text: `Look at this screenshot and extract the full names of all people visible (from contact lists, chat threads, group chats, etc.).
Return ONLY a JSON array of name strings, nothing else.
Example: ["John Smith", "Sarah Johnson", "Mike Davis"]
If no names found, return [].`,
          },
        ],
      },
    ],
  });

  const rawText = (response.content.find((b: { type: string }) => b.type === "text") as { text?: string } | undefined)?.text ?? "";
  let names: string[] = [];
  try {
    const match = rawText.match(/\[[\s\S]*\]/);
    if (match) names = JSON.parse(match[0]) as string[];
  } catch {
    names = [];
  }

  // Search GHL for each name in parallel
  const results = await Promise.all(
    names.slice(0, 20).map(async (name) => {
      const ghl = await searchGHL(name);
      return { name, ghl };
    })
  );

  return NextResponse.json({ results });
}
