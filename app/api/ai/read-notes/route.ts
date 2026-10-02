import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropic, AI_MODEL, extractJson, textOf } from '@/lib/ai/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM = `You read photographs of HANDWRITTEN meeting/panel notes on paper. Transcribe the handwriting
faithfully. Group notes by page number or panel member if the writing indicates them. Do not invent content.
Return ONLY a JSON object: {"notes": [{"pageOrPanel": "e.g. 'Panel Member 1' or 'Page 3'", "note": "the transcribed note"}]}.`;

export async function POST(req: NextRequest) {
  const client = getAnthropic();
  if (!client) return NextResponse.json({ error: 'AI not configured on the server.' }, { status: 501 });

  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  if (!body.image) return NextResponse.json({ error: 'No image provided.' }, { status: 400 });

  const match = body.image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) return NextResponse.json({ error: 'Image must be a base64 data URL.' }, { status: 400 });
  const mediaType = match[1] as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  const data = match[2];

  try {
    const msg = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1500,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } } as Anthropic.ImageBlockParam,
            { type: 'text', text: 'Read the handwritten notes in this image and return the JSON described.' },
          ],
        },
      ],
    });
    const parsed = extractJson<{ notes: { pageOrPanel: string; note: string }[] }>(textOf(msg));
    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Reading notes failed.' }, { status: 502 });
  }
}
