import { NextRequest, NextResponse } from 'next/server';
import { getAnthropic, AI_MODEL, textOf } from '@/lib/ai/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const client = getAnthropic();
  if (!client) return NextResponse.json({ error: 'AI not configured on the server.' }, { status: 501 });

  let body: { text?: string; direction?: 'en-tl' | 'tl-en' };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const to = body.direction === 'tl-en' ? 'English' : 'Filipino (Tagalog)';
  const system = `You are a professional translator for university meeting documents. Translate the user's text into ${to}. Preserve names, numbers, dates, and institutional terminology. Return ONLY the translated text with no preamble.`;

  try {
    const msg = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: body.text || '' }],
    });
    return NextResponse.json({ text: textOf(msg) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Translation failed.' }, { status: 502 });
  }
}
