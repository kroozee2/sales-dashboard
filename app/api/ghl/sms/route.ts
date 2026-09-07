import { NextRequest, NextResponse } from "next/server";

const GHL_BASE = "https://services.leadconnectorhq.com";

export async function POST(req: NextRequest) {
  const { contactId, phone, message } = await req.json();

  if (!process.env.GHL_API_KEY || process.env.GHL_API_KEY === "your_ghl_api_key_here") {
    return NextResponse.json({ success: true, isDemo: true, message: "Demo mode — SMS not sent" });
  }

  try {
    const res = await fetch(`${GHL_BASE}/conversations/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GHL_API_KEY}`,
        "Content-Type": "application/json",
        Version: "2021-04-15",
      },
      body: JSON.stringify({
        type: "SMS",
        contactId,
        message,
        phone,
      }),
    });
    const data = await res.json();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
