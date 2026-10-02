import { NextRequest, NextResponse } from 'next/server';
import type { TranscriptSegment } from '@/lib/types';
import { detectLang, normalizeLocale } from '@/lib/lang-detect';

export const runtime = 'nodejs';
export const maxDuration = 300;

const ELEVENLABS_STT = 'https://api.elevenlabs.io/v1/speech-to-text';

// Map our UI locale to an ElevenLabs language code (ISO-639-3). Filipino/Tagalog
// -> 'fil'; English -> 'eng'; 'auto' (or unknown) -> undefined so Scribe
// auto-detects the language (best for code-switched Taglish meetings).
function langCode(language?: string): string | undefined {
  if (!language || language === 'auto') return undefined;
  if (language.startsWith('en')) return 'eng';
  if (language.startsWith('tl') || language.startsWith('fil')) return 'fil';
  return undefined;
}

interface ScribeWord {
  text: string;
  start?: number;
  end?: number;
  type?: string; // 'word' | 'spacing' | 'audio_event'
  speaker_id?: string;
}

// Fold ElevenLabs' word stream into speaker-contiguous segments the app expects.
function toSegments(words: ScribeWord[], fallbackText: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let cur: { speaker: string; t: number; text: string } | null = null;
  const label = (id?: string) => {
    const n = id ? Number(id.replace(/\D/g, '')) : NaN;
    return Number.isFinite(n) ? `Speaker ${n + 1}` : 'Speaker';
  };

  const push = (c: { speaker: string; t: number; text: string }) => {
    const text = c.text.trim();
    segments.push({ speaker: c.speaker, t: c.t, text, confidence: 0.95, lang: detectLang(text) });
  };
  for (const w of words) {
    if (w.type === 'audio_event') continue;
    const spk = label(w.speaker_id);
    if (!cur || cur.speaker !== spk) {
      if (cur) push(cur);
      cur = { speaker: spk, t: w.start ?? 0, text: w.text ?? '' };
    } else {
      cur.text += w.text ?? '';
    }
  }
  if (cur) push(cur);

  if (segments.length === 0 && fallbackText) {
    segments.push({ speaker: 'Speaker', text: fallbackText, t: 0, confidence: 0.95, lang: detectLang(fallbackText) });
  }
  return segments.filter((s) => s.text.length > 0);
}

export async function POST(req: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Transcription not configured on the server.' }, { status: 501 });
  }

  const form = await req.formData();
  const audio = form.get('audio');
  const language = form.get('language')?.toString();
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: 'No audio provided.' }, { status: 400 });
  }

  try {
    const upstream = new FormData();
    upstream.append('file', audio, 'recording.webm');
    upstream.append('model_id', 'scribe_v1');
    upstream.append('diarize', 'true');
    upstream.append('timestamps_granularity', 'word');
    const code = langCode(language);
    if (code) upstream.append('language_code', code);

    const res = await fetch(ELEVENLABS_STT, {
      method: 'POST',
      headers: { 'xi-api-key': key },
      body: upstream,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`ElevenLabs STT ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }

    const result = (await res.json()) as {
      text?: string;
      language_code?: string;
      words?: ScribeWord[];
    };

    const segments = toSegments(result.words ?? [], result.text ?? '');
    return NextResponse.json({ segments, language: normalizeLocale(result.language_code) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Transcription failed.' },
      { status: 502 },
    );
  }
}
