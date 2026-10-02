// Server-only Anthropic helper. Keys are read from process.env and NEVER
// exposed to the client. Only imported by /api route handlers (server runtime).
import Anthropic from '@anthropic-ai/sdk';

export const AI_MODEL = 'claude-sonnet-5';

export function getAnthropic(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

/** Extract the first JSON object/array from a model response (tolerates prose/fences). */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error('No JSON found in model response');
  // find matching end by scanning
  const opening = candidate[start];
  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  for (let i = start; i < candidate.length; i++) {
    if (candidate[i] === opening) depth++;
    else if (candidate[i] === closing) {
      depth--;
      if (depth === 0) return JSON.parse(candidate.slice(start, i + 1)) as T;
    }
  }
  throw new Error('Unbalanced JSON in model response');
}

/** Collapse an Anthropic message content array into plain text. */
export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}
