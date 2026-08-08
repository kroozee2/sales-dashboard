import { NextRequest, NextResponse } from 'next/server';
import { createLeadsAdminClient } from '@/lib/supabase-leads';

const GHL_API_KEY = process.env.GHL_API_KEY!;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json() as {
    type: 'sms' | 'email';
    message: string;
    subject?: string;
    contactId: string;
  };

  const { type, message, subject, contactId } = body;

  if (!contactId) {
    return NextResponse.json({ error: 'Missing contactId' }, { status: 400 });
  }

  // Send via GHL
  const ghlPayload =
    type === 'sms'
      ? { type: 'SMS', contactId, message }
      : {
          type: 'Email',
          contactId,
          message,
          subject: subject ?? '(no subject)',
          emailFrom: 'andrew@reprogrammingproject.com',
          emailFromName: 'Andrew Kroeze',
        };

  const ghlRes = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GHL_API_KEY}`,
      'Version': '2021-04-15',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(ghlPayload),
  });

  if (!ghlRes.ok) {
    const errText = await ghlRes.text();
    return NextResponse.json({ error: `GHL error: ${errText}` }, { status: 502 });
  }

  const ghlData = await ghlRes.json() as { conversationId?: string; messageId?: string };

  // Append to ongoing_message_feed in Supabase
  const supabase = createLeadsAdminClient();
  const { data: existing } = await supabase
    .from('leads')
    .select('ongoing_message_feed')
    .eq('id', id)
    .single();

  const entry = `[${new Date().toISOString()}] ${type.toUpperCase()}: ${message}\n\n`;
  const newFeed = entry + (existing?.ongoing_message_feed ?? '');

  await supabase
    .from('leads')
    .update({ ongoing_message_feed: newFeed })
    .eq('id', id);

  return NextResponse.json({ success: true, messageId: ghlData.messageId ?? ghlData.conversationId });
}
