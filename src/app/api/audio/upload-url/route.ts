/**
 * Issues a signed Supabase Storage upload URL for a new audio recording.
 *
 * The browser PUTs the audio blob straight to Storage via
 * `supabase.storage.from('meeting-audio').uploadToSignedUrl(objectPath, token, file)`
 * — this route never sees the file itself. Vercel function bodies cap at
 * 4.5 MB; a real meeting recording does not fit through this route.
 *
 * storage_path is deliberately left null here (see 0001_schema.sql's comment
 * on audio_recordings) — signing a URL does not mean the upload happened.
 * Once the client-side upload succeeds, it should update its own row
 * (`storage_path`, `uploaded_at`) directly through the browser Supabase
 * client; audio_recordings_update's RLS policy already permits the creator
 * to do this. No separate "confirm upload" route exists yet.
 */
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { ALLOWED_AUDIO_TYPES, extensionFor } from '@/lib/meetings/files';
import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/ai/guard';

export const runtime = 'nodejs';
export const maxDuration = 15;

// Shared with the browser-side check (src/lib/meetings/files.ts) and kept in
// sync with the meeting-audio bucket's allowed types (0017).
const ALLOWED_MIME_TYPES = ALLOWED_AUDIO_TYPES;

const bodySchema = z.object({
  meetingId: z.string().uuid(),
  mimeType: z.enum(ALLOWED_MIME_TYPES).default('audio/webm'),
  language: z.string().default('en-US'),
});


export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in', code: 'unauthenticated' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', code: 'bad_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { meetingId, mimeType, language } = parsed.data;

  const supabase = await createClient();

  // RLS (audio_recordings_insert) enforces `created_by = auth.uid()` and an
  // admin/head/secretary role; a caller without the right to record for this
  // meeting gets a Postgres policy violation here, not a silent success.
  const { data: audioRow, error: insertError } = await supabase
    .from('audio_recordings')
    .insert({ meeting_id: meetingId, mime_type: mimeType, language, created_by: session.userId })
    .select('id')
    .single();

  if (insertError || !audioRow) {
    return NextResponse.json(
      { error: 'Not permitted to add a recording to this meeting', code: 'forbidden' },
      { status: 403 },
    );
  }

  const objectPath = `${meetingId}/${audioRow.id}.${extensionFor(mimeType)}`;

  const { data: signed, error: signError } = await supabase.storage
    .from('meeting-audio')
    .createSignedUploadUrl(objectPath);

  if (signError || !signed) {
    // The DB row now exists with no storage object behind it. That is fine —
    // storage_path stays null, and the row simply never becomes transcribable.
    return NextResponse.json({ error: 'Could not create an upload URL', code: 'storage_error' }, { status: 502 });
  }

  return NextResponse.json({
    audioId: audioRow.id,
    objectPath,
    token: signed.token,
    signedUrl: signed.signedUrl,
  });
}
