// Browser → API helpers for the real cloud-AI features (Phase 2+).
// Each function calls a Next.js route handler under /api. Callers wrap these in
// try/catch and fall back to the on-device pipeline (summarizer/transcriber/
// translator) when the route is unavailable (offline or keys not configured).

import type { TranscriptSegment } from './types';

export interface AiActionItem {
  task: string;
  assignee?: string;
  deadline?: string;
  status?: 'pending' | 'in_progress' | 'done';
}

export interface AnalysisResult {
  segments: TranscriptSegment[];
  /** Detected/served language locale (e.g. 'en-US' | 'tl-PH'), useful for auto mode. */
  language?: string;
  summary: string;
  keyDecisions: string[];
  actionItems: AiActionItem[];
  minutesDraft?: {
    callToOrder: string;
    previousMinutes: string;
    agendaItems: { title: string; notes: string }[];
    adjournment: string;
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

/** Real speech-to-text for an uploaded/recorded audio file. Returns segments +
 * the language the provider served/detected (matters in 'auto' mode). */
export async function transcribeAudio(
  file: File | Blob,
  language: string,
): Promise<{ segments: TranscriptSegment[]; language?: string }> {
  const fd = new FormData();
  fd.append('audio', file);
  fd.append('language', language);
  const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`/api/transcribe -> ${res.status}`);
  const data = (await res.json()) as { segments: TranscriptSegment[]; language?: string };
  return { segments: data.segments, language: data.language };
}

/** Structured analysis of a transcript: summary, decisions, action items, minutes draft. */
export async function analyzeTranscript(
  segments: TranscriptSegment[],
  opts: { agenda?: string[]; language?: string } = {},
): Promise<Omit<AnalysisResult, 'segments'>> {
  return postJson('/api/ai/analyze', { segments, ...opts });
}

/** Full pipeline for an audio file: transcribe → analyze. Throws if any stage fails. */
export async function analyzeAudioViaApi(file: File | Blob, language: string, agenda?: string[]): Promise<AnalysisResult> {
  const { segments, language: detected } = await transcribeAudio(file, language);
  // In 'auto' mode, analyse in the language the provider actually detected.
  const resolved = detected || (language === 'auto' ? undefined : language);
  const analysis = await analyzeTranscript(segments, { agenda, language: resolved });
  return { segments, language: resolved, ...analysis };
}

export interface ChatCitation {
  segmentIndex: number;
  speaker: string;
  t: number;
  quote: string;
}

export interface ChatAnswer {
  answer: string;
  found: boolean;
  citations: ChatCitation[];
}

/** Grounded chat over the currently-open document (transcript + summary + notes). */
export async function chatWithFile(payload: {
  question: string;
  document: { title: string; summary?: string; notes?: string; segments: TranscriptSegment[] };
  history?: { role: 'user' | 'assistant'; content: string }[];
}): Promise<ChatAnswer> {
  return postJson('/api/ai/chat', payload);
}

/** Read handwritten panel notes from an uploaded image (Claude vision). */
export async function readHandwrittenNotes(imageDataUrl: string): Promise<{ pageOrPanel: string; note: string }[]> {
  const data = await postJson<{ notes: { pageOrPanel: string; note: string }[] }>('/api/ai/read-notes', { image: imageDataUrl });
  return data.notes;
}

/** Quality EN<->TL translation (falls back to the local dictionary when unavailable). */
export async function translateText(text: string, direction: 'en-tl' | 'tl-en'): Promise<string> {
  const data = await postJson<{ text: string }>('/api/ai/translate', { text, direction });
  return data.text;
}
