import { NextResponse } from "next/server";
import { DEMO_CALLS } from "@/lib/mock-data";

const GHL_BASE = "https://services.leadconnectorhq.com";
const LOCATION_ID = process.env.GHL_LOCATION_ID || "ZJQSLWJWH7OVHVrJjmPj";

export async function GET() {
  if (!process.env.GHL_API_KEY || process.env.GHL_API_KEY === "your_ghl_api_key_here") {
    return NextResponse.json({ appointments: DEMO_CALLS, isDemo: true });
  }
  try {
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - 7);
    const endTime = new Date();
    endTime.setDate(endTime.getDate() + 30);

    const res = await fetch(
      `${GHL_BASE}/appointments/?locationId=${LOCATION_ID}&startTime=${startTime.toISOString()}&endTime=${endTime.toISOString()}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GHL_API_KEY}`,
          Version: "2021-07-28",
        },
      }
    );
    const data = await res.json();
    return NextResponse.json({ appointments: data.appointments || [], isDemo: false });
  } catch {
    return NextResponse.json({ appointments: DEMO_CALLS, isDemo: true });
  }
}
