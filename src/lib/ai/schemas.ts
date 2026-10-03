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

/**
 * Minutes in the CHED AO No. 06, s. 2014 order of business (see
 * src/lib/minutes/ched.ts). Every string may be empty when the transcript
 * says nothing about that part — the document prints "None." rather than
 * inventing content.
 */
const businessItem = z.object({
  title: z.string(),
  discussion: z.string(),
  action: z.string(),
});

export const minutesOutput = z.object({
  callToOrder: z.string(),
  quorum: z.string(),
  provisionalAgenda: z.string(),
  previousMinutes: z.string(),
  mattersArising: z.string(),
  chairpersonTime: z.string(),
  headReport: z.string(),
  newBusiness: z.array(
    businessItem.extend({
      category: z.enum(['financial', 'academic', 'administrative', 'policy', 'legal', 'none']),
    }),
  ),
  mattersForConfirmation: z.array(businessItem),
  otherMatters: z.array(businessItem),
  adjournment: z.string(),
});

export type ActionItemsOutput = z.infer<typeof actionItemsOutput>;
export type MinutesOutput = z.infer<typeof minutesOutput>;
