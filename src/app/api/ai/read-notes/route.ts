/**
 * Reads a photographed page of handwritten panel notes (port of the root
 * app's read-notes route, hardened).
 *
 * - Only active staff (secretary/head/admin) who may edit the meeting.
 * - Input is just an attachment id: the server loads the stored photo through
 *   the caller's RLS-scoped client, so nobody can push arbitrary images (or
 *   unbounded payloads) through our paid API key.
 * - The model's output is validated before anything is returned.
 *
 * The photo itself stays in meeting-attachments as evidence (adviser
 * requirement: handwritten panel notes are never lost).
 */
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/ai/guard';
import { MODEL, MAX_TOKENS_JSON, aiErrorResponse, getClaude, textFrom } from '@/lib/ai/claude';

export const runtime = 'nodejs';
export const maxDuration = 60;

const bodySchema = z.object({ attachmentId: z.string().uuid() });

const notesSchema = z.object({
  notes: z
    .array(
      z.object({
        pageOrPanel: z.string().max(120).nullish(),
        note: z.string().min(1).max(4000),
      }),
    )
    .max(60),
});

/** Claude's image input limit is 5 MB; photos are downscaled in the browser first. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const SYSTEM = `You transcribe photographs of HANDWRITTEN notes written on paper by a thesis/capstone defense panel or meeting participants at a Philippine state university.
Transcribe the handwriting faithfully, in the language it is written (English or Filipino). Do not summarise, correct, or invent content; mark unreadable words as [illegible].
If the writing indicates a page number or which panel member wrote it, group the notes by that label.
Return ONLY a JSON object: {"notes": [{"pageOrPanel": "e.g. Panel member 1, or Page 2, or null", "note": "the transcribed text"}]}.`;

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The response was not JSON.');
  return JSON.parse(text.slice(start, end + 1));
}

export async function POST(request: Request) {
  const staff = await requireStaff();
  if (!staff) {
    return NextResponse.json({ error: 'Only active secretaries, heads and administrators can read notes.' }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Send the id of an attached photo.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from('meeting_attachments')
    .select('id, meeting_id, mime_type, storage_path, size_bytes')
    .eq('id', parsed.data.attachmentId)
    .maybeSingle();
  if (!attachment) {
    return NextResponse.json({ error: 'That attachment was not found.' }, { status: 404 });
  }

  const { data: canEdit } = await supabase.rpc('sm_can_edit_meeting_docs', { p_meeting_id: attachment.meeting_id });
  if (canEdit !== true) {
    return NextResponse.json({ error: "You can't edit this meeting's minutes." }, { status: 403 });
  }

  const mediaType = attachment.mime_type as 'image/jpeg' | 'image/png' | 'image/webp';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mediaType)) {
    return NextResponse.json({ error: 'Only photos (JPG, PNG, WebP) can be read.' }, { status: 400 });
  }
  if (attachment.size_bytes > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'That photo is too large to read. Retake it a little further away and attach it again.' }, { status: 413 });
  }

  const { data: blob, error: downloadError } = await supabase.storage.from('meeting-attachments').download(attachment.storage_path);
  if (downloadError || !blob) {
    return NextResponse.json({ error: "The photo couldn't be opened." }, { status: 502 });
  }
  const data = Buffer.from(await blob.arrayBuffer()).toString('base64');

  try {
    const message = await getClaude().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS_JSON,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            { type: 'text', text: 'Transcribe the handwritten notes in this photo and return the JSON described.' },
          ],
        },
      ],
    });
    const result = notesSchema.safeParse(extractJson(textFrom(message)));
    if (!result.success) {
      return NextResponse.json({ error: 'The notes could not be read clearly. Try a sharper photo.' }, { status: 422 });
    }
    return NextResponse.json({ notes: result.data.notes });
  } catch (err) {
    const { status, body } = aiErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
