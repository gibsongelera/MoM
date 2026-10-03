/**
 * Response schemas for Claude's structured outputs (used by the transcription
 * webhook's minutes and action-item drafting).
 *
 * The response schemas are handed to Claude via zodOutputFormat, so the model is
 * constrained to emit exactly this shape — the alternative is regex-scraping
 * prose, which is what the legacy extractor had to do.
 *
 * Structured outputs reject several JSON Schema keywords (min/max, minLength,
 * pattern), so bounds are validated client-side by zod after parsing rather than
 * declared in the schema sent to the API.
 */
import * as z from 'zod';

// ---------------------------------------------------------------------------
// Model output shapes
// ---------------------------------------------------------------------------

export const actionItemsOutput = z.object({
  items: z.array(
    z.object({
      text: z.string(),
      assignee: z.string(),
      deadline: z.string(),
      confidence: z.number(),
    }),
  ),
});

export const minutesOutput = z.object({
  callToOrder: z.string(),
  previousMinutes: z.string(),
  agendaItems: z.array(
    z.object({
      title: z.string(),
      notes: z.string(),
    }),
  ),
  adjournment: z.string(),
});

export type ActionItemsOutput = z.infer<typeof actionItemsOutput>;
export type MinutesOutput = z.infer<typeof minutesOutput>;
