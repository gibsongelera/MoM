/**
 * ASR provider registry.
 *
 * Swap or add a provider by editing this file only — nothing else in the app
 * should import elevenlabs.ts or assemblyai.ts directly.
 */
import { elevenLabsProvider } from './elevenlabs';
import { assemblyAiProvider } from './assemblyai';
import type { AsrLanguage, AsrProvider } from './types';

const PROVIDERS: Record<string, AsrProvider> = {
  elevenlabs: elevenLabsProvider,
  assemblyai: assemblyAiProvider,
};

const DEFAULT_PROVIDER = 'elevenlabs';

export function getProvider(name: string = DEFAULT_PROVIDER): AsrProvider {
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown ASR provider: ${name}`);
  return provider;
}

/**
 * Picks a provider that actually supports the requested language — Cebuano
 * only has one real answer today. Falls back to scanning the whole registry
 * only when the preferred provider can't do it, so the caller still gets a
 * clear rejection rather than a silently wrong transcription when nothing
 * supports the language at all.
 */
export function selectProvider(language: AsrLanguage, preferred: string = DEFAULT_PROVIDER): AsrProvider {
  const first = PROVIDERS[preferred];
  if (first?.supportedLanguages.includes(language)) return first;

  const fallback = Object.values(PROVIDERS).find((p) => p.supportedLanguages.includes(language));
  if (fallback) return fallback;

  throw new Error(`No registered ASR provider supports language "${language}"`);
}

export * from './types';
export { buildKeyterms } from './keyterms';
export type { KeytermSource } from './keyterms';

/**
 * How transcripts come back to us.
 *
 * - `webhook`: submit and return; the provider calls /api/webhooks/* later.
 *   Needs a public URL registered in the provider dashboard.
 * - `sync`: hold the provider request open (after the HTTP response) and
 *   store the result ourselves. Works anywhere, including localhost.
 *
 * ASR_DELIVERY forces one; otherwise a localhost app URL (which no provider
 * can call back to) means `sync`. A webhook submit that fails because no
 * webhook is registered also falls back to `sync` (see /api/transcribe).
 */
export function asrDelivery(): 'webhook' | 'sync' {
  const forced = process.env.ASR_DELIVERY;
  if (forced === 'webhook' || forced === 'sync') return forced;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  if (!appUrl || /\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(appUrl)) return 'sync';
  return 'webhook';
}
