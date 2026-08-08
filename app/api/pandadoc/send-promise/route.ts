import { NextRequest, NextResponse } from "next/server";

const TEMPLATE_ID = "ompmooGfE7mKUbimE553g3";
const PANDADOC_API = "https://api.pandadoc.com/public/v1";

export async function POST(req: NextRequest) {
  const { name, email, phone } = await req.json();

  if (!name || !email) {
    return NextResponse.json({ error: "name and email required" }, { status: 400 });
  }

  const apiKey = process.env.PANDADOC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "PANDADOC_API_KEY not set" }, { status: 500 });
  }

  // 1. Create Helm client record + get unique onboarding form URL
  const helmRes = await fetch(process.env.HELM_ENROLL_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-enroll-secret": process.env.HELM_ENROLL_SECRET!,
    },
    body: JSON.stringify({ name, email, phone }),
  });
  const helmData = await helmRes.json();
  if (!helmData.formUrl) {
    return NextResponse.json({ error: `Helm enroll failed: ${helmData.error}` }, { status: 500 });
  }
  const redirectUrl: string = helmData.formUrl;

  const headers = {
    Authorization: `API-Key ${apiKey}`,
    "Content-Type": "application/json",
  };

  const [firstName, ...rest] = name.trim().split(" ");
  const lastName = rest.join(" ") || "";

  // 2. Create document from template
  const createRes = await fetch(`${PANDADOC_API}/documents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: `The 7-Figure CEO Promise — ${name}`,
      template_uuid: TEMPLATE_ID,
      recipients: [
        {
          email,
          first_name: firstName,
          last_name: lastName,
          role: "Role 1",
          redirect: { is_enabled: true, url: redirectUrl },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    return NextResponse.json({ error: `Create failed: ${err}` }, { status: 500 });
  }

  const doc = await createRes.json();
  const docId = doc.id;

  // 2. Poll for Draft status (up to 10s)
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const statusRes = await fetch(`${PANDADOC_API}/documents/${docId}`, { headers });
    const status = await statusRes.json();
    if (status.status === "document.draft") break;
  }

  // 3. Send the document
  const sendRes = await fetch(`${PANDADOC_API}/documents/${docId}/send`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      subject: "Welcome to 7-Figure CEO — Your Promise Document",
      message: `Hi ${firstName}, so excited to have you in the 7-Figure CEO family! Please sign the document below to make things official. Once you're done, you'll be taken straight to your onboarding form. See you on the inside!`,
    }),
  });

  if (!sendRes.ok) {
    const err = await sendRes.text();
    return NextResponse.json({ error: `Send failed: ${err}` }, { status: 500 });
  }

  // 4. Get the recipient's shared signing link
  const detailRes = await fetch(`${PANDADOC_API}/documents/${docId}`, { headers });
  const detail = await detailRes.json();
  const signingLink: string = detail.recipients?.[0]?.shared_link ?? `https://app.pandadoc.com/a/#/documents/${docId}`;

  return NextResponse.json({ success: true, docId, signingLink });
}
