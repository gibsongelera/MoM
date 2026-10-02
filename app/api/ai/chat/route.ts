import { NextRequest, NextResponse } from 'next/server';
import { getAnthropic, AI_MODEL, extractJson, textOf } from '@/lib/ai/server';
import type { TranscriptSegment } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Grounded, no-hallucination chat over ONE open document.
const SYSTEM = `You are SmartMin's meeting assistant. You answer questions about a SINGLE meeting document
(its transcript, summary, and notes) that is provided to you.

STRICT RULES:
- Use ONLY information in the provided <document>. Do not use outside knowledge.
- Every claim must be supported by a specific transcript segment; cite the segment index(es) you used.
- If the answer is not present in the document, set "found" to false and say you could not find it in this file.
- Be concise and professional.

Return ONLY a JSON object:
{
  "answer": "your answer in plain text",
  "found": true,
  "citations": [{"segmentIndex": 0, "speaker": "...", "t": 0, "quote": "the exact supporting sentence"}]
}`;

interface Body {
  question: string;
  document: { title: string; summary?: string; notes?: string; segments: TranscriptSegment[] };
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export async function POST(req: NextRequest) {
  const client = getAnthropic();
  if (!client) return NextResponse.json({ error: 'AI not configured on the server.' }, { status: 501 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { question, document, history = [] } = body;
  const segmentsText = (document.segments || []).map((s, i) => `[${i}] (${s.speaker || '?'}, ${Math.round(s.t)}s) ${s.text}`).join('\n');
  const docBlock = `<document title="${document.title}">
SUMMARY: ${document.summary || '(none)'}
NOTES: ${document.notes || '(none)'}
TRANSCRIPT SEGMENTS:
${segmentsText || '(no transcript)'}
</document>`;

  try {
    const msg = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1200,
      system: SYSTEM,
      messages: [
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user' as const, content: `${docBlock}\n\nQuestion: ${question}` },
      ],
    });
    const data = extractJson(textOf(msg));
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Chat failed.' }, { status: 502 });
  }
}
