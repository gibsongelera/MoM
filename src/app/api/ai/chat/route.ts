/**
 * SmartMin Assistant (floating chat on every dashboard page).
 *
 * - Any active account may use it (the client asked for it on the faculty
 *   dashboard too); inactive / signed-out callers are refused before any
 *   paid work.
 * - The browser sends only a scope ({kind, id}), the question and the recent
 *   turns. The context document is rebuilt here through the caller's
 *   RLS-scoped client (src/lib/ai/chat.ts), so nothing outside what they can
 *   already read can reach the model or the answer.
 * - The context goes first with a cache breakpoint, so follow-up questions on
 *   the same meeting reuse it instead of paying for the transcript again.
 * - The answer is validated against a schema before it is returned.
 */
import { NextResponse } from 'next/server';
import * as z from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { createClient } from '@/lib/supabase/server';
import { requireActive } from '@/lib/ai/guard';
import { MAX_TOKENS_JSON, MODEL, RefusalError, aiErrorResponse, cacheStats, getClaude } from '@/lib/ai/claude';
import { ASSISTANT_SYSTEM, buildChatContext, chatAnswerSchema, chatScopeSchema } from '@/lib/ai/chat';

export const runtime = 'nodejs';
export const maxDuration = 120;

const bodySchema = z.object({
  scope: chatScopeSchema,
  question: z.string().trim().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(6000) }))
    .max(12)
    .default([]),
});

export async function POST(request: Request) {
  const caller = await requireActive();
  if (!caller) {
    return NextResponse.json({ error: 'Sign in with an active account to use the assistant.' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ask a question of up to 2,000 characters.' }, { status: 400 });
  }
  const { scope, question, history } = parsed.data;

  const supabase = await createClient();
  const context = await buildChatContext(supabase, caller, scope);
  if (!context) {
    return NextResponse.json({ error: "That record wasn't found, or you don't have access to it." }, { status: 404 });
  }

  // Context first (cached), then the conversation so far, then the question.
  // The history must start with a user turn and alternate.
  const turns = [...history, { role: 'user' as const, content: question }];
  while (turns.length && turns[0].role !== 'user') turns.shift();
  const messages: Anthropic.MessageParam[] = turns.map((t, i) =>
    i === 0
      ? {
          role: 'user',
          content: [
            { type: 'text', text: context.doc, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: t.content },
          ],
        }
      : { role: t.role, content: t.content },
  );

  try {
    const message = await getClaude().messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS_JSON,
      system: ASSISTANT_SYSTEM,
      messages,
      output_config: { effort: 'low', format: zodOutputFormat(chatAnswerSchema) },
    });
    if (message.stop_reason === 'refusal') throw new RefusalError(message.stop_details?.category ?? null);
    const answer = message.parsed_output;
    if (!answer) {
      return NextResponse.json({ error: "The assistant couldn't form an answer. Try rephrasing." }, { status: 502 });
    }
    console.info(`[ai-chat] ${JSON.stringify({ scope: scope.kind, role: caller.role, found: answer.found, ...cacheStats(message) })}`);
    return NextResponse.json({ ...answer, contextLabel: context.label });
  } catch (err) {
    const { status, body } = aiErrorResponse(err);
    console.error(`[ai-chat] failed ${JSON.stringify({ scope: scope.kind, status, code: body.code })}`);
    return NextResponse.json(body, { status });
  }
}
