/**
 * Transcribes a faculty member's own recording (personal_meetings, 0018).
 *
 * The browser uploads the audio straight to the private `personal-audio`
 * bucket (owner-only storage policies) and records the path on its row; this
 * route signs a short-lived URL for the provider and transcribes after the
 * response. The row's transcript_status is the progress signal the page
 * follows. Every read here goes through the caller's RLS-scoped client, so a
 * user can only ever transcribe their own recording.
 */
import { NextResponse, after } from 'next/server';
import * as z from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireActive } from '@/lib/ai/guard';
import { buildKeyterms, selectProvider, type AsrLanguage } from '@/lib/asr';
import { asrLog, transcribePersonalRecording } from '@/lib/asr/complete';

export const runtime = 'nodejs';
export const maxDuration = 300;

const bodySchema = z.object({
  personalMeetingId: z.string().uuid(),
  language: z.enum(['eng', 'fil', 'ceb', 'auto']).default('auto'),
});

const SIGNED_URL_TTL_SEC = 60 * 60;

export async function POST(request: Request) {
  const caller = await requireActive();
  if (!caller) {
    return NextResponse.json({ error: 'Sign in with an active account first.', code: 'unauthenticated' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', code: 'bad_request' }, { status: 400 });
  }
  const { personalMeetingId, language } = parsed.data;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from('personal_meetings')
    .select('id, user_id, title, attendees, audio_path, transcript_status')
    .eq('id', personalMeetingId)
    .eq('user_id', caller.userId)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: 'That entry was not found.', code: 'not_found' }, { status: 404 });
  if (!row.audio_path) {
    return NextResponse.json({ error: 'Upload a recording first.', code: 'no_audio' }, { status: 409 });
  }
  if (row.transcript_status === 'processing') {
    return NextResponse.json({ status: 'processing' }, { status: 202 });
  }

  let provider;
  try {
    provider = selectProvider(language as AsrLanguage);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unsupported language' }, { status: 400 });
  }
  if (!provider.transcribe) {
    return NextResponse.json({ error: 'Transcription is not available for that language yet.' }, { status: 400 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from('personal-audio')
    .createSignedUrl(row.audio_path, SIGNED_URL_TTL_SEC);
  if (signError || !signed) {
    return NextResponse.json({ error: 'Could not read the recording from storage.', code: 'storage_error' }, { status: 502 });
  }

  const { data: marked, error: markError } = await supabase
    .from('personal_meetings')
    .update({ transcript_status: 'processing', transcript_error: null })
    .eq('id', row.id)
    .select('id');
  if (markError || !marked?.length) {
    return NextResponse.json({ error: "Couldn't start the transcription. Try again.", code: 'forbidden' }, { status: 403 });
  }

  const keyterms = buildKeyterms({
    meeting: { project_title: row.title, sub_type: null },
    participantNames: [caller.name, ...(row.attendees ?? '').split(/[,;\n]/)].map((s) => s.trim()).filter(Boolean),
  });

  asrLog('personal_submit', { personalId: row.id, userId: caller.userId });
  after(() =>
    transcribePersonalRecording(provider, row.id, caller.userId, {
      audioUrl: signed.signedUrl,
      language: language as AsrLanguage,
      diarize: true,
      keyterms,
      noVerbatim: true,
      webhookRef: row.id,
    }),
  );

  return NextResponse.json({ status: 'processing' }, { status: 202 });
}
