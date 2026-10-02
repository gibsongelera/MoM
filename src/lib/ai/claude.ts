/**
 * Claude client and shared request plumbing.
 *
 * Server-only. ANTHROPIC_API_KEY must never reach the browser, so nothing here
 * may be imported from a client component.
 */
import 'server-only';
import Anthropic, { APIConnectionError, APIError, RateLimitError } from '@anthropic-ai/sdk';

/**
 * Structural shape of the fields these helpers read.
 *
 * Deliberately not the SDK's `Message` type: the beta endpoint (needed for
 * server-side fallbacks) returns `BetaMessage`, whose content blocks are a
 * wider union. Matching on shape lets one set of helpers serve both endpoints.
 */
type MessageLike = {
  stop_reason: string | null;
  stop_details?: { category?: string | null } | null;
  content: { type: string }[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
};

/**
 * Claude Opus 5 by default (thinking is on by default on this model).
 * Override with ANTHROPIC_MODEL without a code change.
 */
export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';

/**
 * max_tokens caps thinking *and* response text together on Opus 5. Sized with
 * room for both; too tight and answers truncate mid-sentence.
 */
export const MAX_TOKENS_JSON = 16_000;
export const MAX_TOKENS_STREAM = 64_000;

/**
 * Opt into server-side fallbacks. Claude Opus 5 runs elevated safety
 * classifiers that can decline a request; without this a refusal just stops.
 * "default" lets the API route by refusal category instead of us pinning a
 * model that later gets deprecated.
 */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

let client: Anthropic | null = null;

export function getClaude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new MissingApiKeyError();
  }
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export class MissingApiKeyError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.');
    this.name = 'MissingApiKeyError';
  }
}

export class RefusalError extends Error {
  constructor(public category: string | null) {
    super(
      'Claude declined this request' +
        (category ? ` (category: ${category}).` : '.') +
        ' Nothing was generated.',
    );
    this.name = 'RefusalError';
  }
}

/**
 * Pulls the text out of a response, refusing to treat a declined request as a
 * successful empty one.
 *
 * A refusal comes back as HTTP 200 with stop_reason "refusal" and an empty (or
 * partial) content array, so reading content[0] unconditionally would silently
 * yield "" and look like a model that had nothing to say.
 */
export function textFrom(message: MessageLike): string {
  if (message.stop_reason === 'refusal') {
    throw new RefusalError(message.stop_details?.category ?? null);
  }
  return message.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

/** Cache-read hits prove the transcript prefix is being reused across calls. */
export function cacheStats(message: MessageLike) {
  return {
    cacheRead: message.usage.cache_read_input_tokens ?? 0,
    cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
    input: message.usage.input_tokens,
    output: message.usage.output_tokens,
  };
}

/**
 * Maps an SDK/domain error to a response body and status.
 *
 * A missing key is the operator's problem (503, and the client should fall back
 * to the local summariser); a refusal is terminal for that input (422, retrying
 * the same text will refuse again).
 */
export function aiErrorResponse(err: unknown): { status: number; body: Record<string, unknown> } {
  if (err instanceof MissingApiKeyError) {
    return { status: 503, body: { error: err.message, code: 'no_api_key', fallback: 'local' } };
  }
  if (err instanceof RefusalError) {
    return { status: 422, body: { error: err.message, code: 'refusal', category: err.category } };
  }
  /*
   * The SDK exports its error classes as module-level names, not as statics on
   * the default export — `Anthropic.RateLimitError` is undefined, and
   * `instanceof undefined` throws. Ordered most specific first; APIError is the
   * base for every non-2xx response (there is no APIStatusError).
   */
  if (err instanceof RateLimitError) {
    return {
      status: 429,
      body: { error: 'Claude is rate limited. Try again shortly.', code: 'rate_limit', fallback: 'local' },
    };
  }
  if (err instanceof APIConnectionError) {
    return {
      status: 504,
      body: { error: 'Could not reach Claude.', code: 'offline', fallback: 'local' },
    };
  }
  if (err instanceof APIError) {
    return { status: 502, body: { error: err.message, code: 'upstream', status: err.status } };
  }
  const message = err instanceof Error ? err.message : 'Unknown error';
  return { status: 500, body: { error: message, code: 'unknown' } };
}
