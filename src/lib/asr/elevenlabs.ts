/**
 * ElevenLabs Scribe v2 speech-to-text provider.
 *
 * Wire format verified against elevenlabs.io/docs (Aug 2026):
 *   - POST /v1/speech-to-text, multipart/form-data, header `xi-api-key`.
 *   - `source_url` submits by URL (no file upload) — the alternative to `file`.
 *   - Async delivery: `webhook: true` plus `webhook_metadata` (echoed back
 *     verbatim under `data.webhook_metadata` in the callback body) is how we
 *     thread our own transcription_jobs.id through. There is no per-request
 *     webhook URL param — the destination itself is configured once in the
 *     ElevenLabs dashboard (Settings -> Webhooks).
 *   - Signature header is `elevenlabs-signature: t={unix_ts},v0={hex hmac}`,
 *     HMAC-SHA256 of the string `${timestamp}.${rawBody}` with the webhook
 *     signing secret. This exact byte format is corroborated by ElevenLabs'
 *     own SDK source and third-party references, but is NOT shown with a
 *     first-party code sample on the public docs pages as of this writing —
 *     verify it against one real webhook delivery (log the raw header and
 *     body once) before relying on it in production.
 *   - `keyterms` is an array field (OpenAPI: type array, items string), sent
 *     over multipart the standard way arrays are encoded in form-data: one
 *     repeated `keyterms` field per term, plain (unquoted) strings - NOT one
 *     field holding `JSON.stringify(array)`. That encoding was tried first
 *     and produced "All keywords must be less than 50 characters" on every
 *     request regardless of individual term length, because the whole
 *     JSON-stringified blob was being read back as a single keyterm.
 *     Confirmed 50-char/5-word/no-`<>{}[]\`-chars limits per term.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AsrLanguage, AsrProvider, AsrRequest, AsrResult, AsrSubmission, AsrWord } from './types';
import { AsrProviderError } from './types';

const API_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
const MODEL = 'scribe_v2';

/** How long a webhook signature stays acceptable, guarding against replay. */
const SIGNATURE_TOLERANCE_SEC = 5 * 60;

function languageCode(lang: AsrLanguage): string | null {
  if (lang === 'auto') return null;
  return lang; // 'eng' | 'fil' | 'ceb' are already ISO-639-3, accepted as-is
}

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new AsrProviderError('elevenlabs', 'ELEVENLABS_API_KEY is not set');
  return key;
}

function webhookSecret(): string {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) throw new AsrProviderError('elevenlabs', 'ELEVENLABS_WEBHOOK_SECRET is not set');
  return secret;
}

async function submit(req: AsrRequest): Promise<AsrSubmission> {
  const form = new FormData();
  form.append('model_id', MODEL);
  form.append('source_url', req.audioUrl);
  const lang = languageCode(req.language);
  if (lang) form.append('language_code', lang);
  form.append('diarize', String(req.diarize));
  if (req.diarize) form.append('num_speakers', '32');
  form.append('no_verbatim', String(req.noVerbatim));
  // Defense-in-depth: keyterms.ts already truncates to <49 chars / <=5 words
  // and strips the characters ElevenLabs prohibits, but this is the actual
  // network boundary - re-enforce the same limits here too, so a future
  // upstream regression fails locally in a filter rather than silently
  // reaching the API with an invalid term again.
  //
  // `keyterms` is an array field. A single multipart field whose value is
  // `JSON.stringify(array)` is NOT how form-data arrays are encoded - that
  // sends one field containing a string like `["ZPPSU","CICS",...]`, which
  // ElevenLabs then treats as ONE keyterm. That string is both far longer
  // than 50 characters and contains the prohibited `[`/`]`/`"` characters,
  // which is exactly the "All keywords must be less than 50 characters"
  // error this kept producing regardless of how short each real term was.
  // The correct encoding is one repeated `keyterms` field per term.
  const PROHIBITED_CHARS = /[<>{}[\]\\]/g;
  const safeKeyterms = req.keyterms
    .map((k) => k.trim().replace(PROHIBITED_CHARS, ''))
    .filter((k) => k.length > 0 && k.length < 50);
  for (const term of safeKeyterms) form.append('keyterms', term);
  form.append('webhook', 'true');
  form.append('webhook_metadata', JSON.stringify({ transcriptionJobId: req.webhookRef }));

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey() },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new AsrProviderError('elevenlabs', `submit failed: ${detail || res.statusText}`, res.status);
  }

  const body = (await res.json()) as { request_id?: string; transcription_id?: string };
  const providerJobId = body.request_id ?? body.transcription_id;
  if (!providerJobId) {
    throw new AsrProviderError('elevenlabs', 'submit response had no request/transcription id');
  }
  return { providerJobId, model: MODEL };
}

function verifyWebhook(rawBody: string, headers: Headers): boolean {
  const header = headers.get('elevenlabs-signature');
  if (!header) return false;

  const parts: Record<string, string> = {};
  for (const kv of header.split(',')) {
    const [k, v] = kv.trim().split('=');
    if (k && v) parts[k] = v;
  }
  const timestamp = parts.t;
  const signature = parts.v0;
  if (!timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SEC) return false;

  const expected = createHmac('sha256', webhookSecret()).update(`${timestamp}.${rawBody}`).digest('hex');

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type ElevenLabsWebhookPayload = {
  type?: string;
  data?: {
    request_id?: string;
    webhook_metadata?: { transcriptionJobId?: string } | null;
    transcription?: {
      language_code?: string;
      language_probability?: number;
      text?: string;
      words?: {
        text: string;
        start: number;
        end: number;
        type: 'word' | 'spacing' | 'audio_event';
        speaker_id?: string | null;
      }[];
    };
  };
};

async function parseWebhook(payload: unknown): Promise<AsrResult> {
  const body = payload as ElevenLabsWebhookPayload;
  const t = body?.data?.transcription;
  if (!body?.data?.request_id || !t) {
    throw new AsrProviderError('elevenlabs', 'webhook payload missing data.request_id or data.transcription');
  }

  const words: AsrWord[] = (t.words ?? []).map((w) => ({
    text: w.text,
    start: w.start,
    end: w.end,
    type: w.type,
    speakerId: w.speaker_id ?? null,
  }));

  return {
    providerJobId: body.data.request_id,
    webhookRef: body.data.webhook_metadata?.transcriptionJobId ?? null,
    languageCode: t.language_code ?? 'unknown',
    languageProbability: t.language_probability ?? null,
    text: t.text ?? '',
    words,
  };
}

export const elevenLabsProvider: AsrProvider = {
  name: 'elevenlabs',
  supportedLanguages: ['eng', 'fil', 'ceb', 'auto'],
  submit,
  verifyWebhook,
  parseWebhook,
};
