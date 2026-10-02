import { NextRequest, NextResponse } from 'next/server';
import { getAnthropic, AI_MODEL, extractJson, textOf } from '@/lib/ai/server';
import type { TranscriptSegment } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM = `You are an expert institutional meeting secretary for a Philippine state university.
Analyze the meeting transcript and produce STRUCTURED MINUTES. Work strictly from the transcript —
never invent decisions, names, or deadlines that are not supported by the text.

Return ONLY a JSON object with this exact shape:
{
  "summary": "3-5 sentence executive summary",
  "keyDecisions": ["decision 1", "decision 2"],
  "actionItems": [{"task": "...", "assignee": "name or ''", "deadline": "as stated or ''", "status": "pending"}],
  "minutesDraft": {
    "callToOrder": "...",
    "previousMinutes": "...",
    "agendaItems": [{"title": "...", "notes": "..."}],
    "adjournment": "..."
  }
}`;

export async function POST(req: NextRequest) {
  const client = getAnthropic();
  if (!client) return NextResponse.json({ error: 'AI not configured on the server.' }, { status: 501 });

  let body: { segments?: TranscriptSegment[]; agenda?: string[]; language?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const segments = body.segments || [];
  const transcript = segments.map((s, i) => `[${i}] ${s.speaker || 'Speaker'}: ${s.text}`).join('\n');

  try {
    const msg = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 2500,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Meeting agenda: ${(body.agenda || []).join('; ') || '(none provided)'}\nLanguage: ${body.language || 'en-US'}\n\nTranscript:\n${transcript}`,
        },
      ],
    });
    const data = extractJson(textOf(msg));
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Analysis failed.' }, { status: 502 });
  }
}
