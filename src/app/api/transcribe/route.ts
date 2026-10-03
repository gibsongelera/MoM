/**
 * Submits an already-uploaded recording to the ASR provider.
 *
 * Never waits for the transcript in the response: either the provider calls
 * back through /api/webhooks/* (`webhook` delivery), or — when no webhook can
 * reach us, e.g. on localhost, or none is registered — the transcription runs
 * after the response via after() (`sync` delivery; see asrDelivery()). Either
 * way the client follows this job's row via Supabase Realtime.
 */
import { NextResponse, after } from 'next/server';
import * as z from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/ai/guard';
import { selectProvider, buildKeyterms, asrDelivery, AsrProviderError, type AsrLanguage, type AsrProvider, type AsrRequest } from '@/lib/asr';
import { asrLog, transcribeAndComplete } from '@/lib/asr/complete';

export const runtime = 'nodejs';
// The sync delivery transcribes inside after(), which shares this budget.
export const maxDuration = 300;

const bodySchema = z.object({
  audioId: z.string().uuid(),
  language: z.enum(['eng', 'fil', 'ceb', 'auto']).default('auto'),
});

/** Long enough for the provider to fetch a multi-GB file, short enough to not linger. */
const SIGNED_URL_TTL_SEC = 60 * 60;

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
  const { audioId, language } = parsed.data;

  const supabase = await createClient();

  const { data: audio, error: audioError } = await supabase
    .from('audio_recordings')
    .select('id, meeting_id, storage_path, duration_sec')
    .eq('id', audioId)
    .single();

  if (audioError || !audio) {
    return NextResponse.json({ error: 'Recording not found', code: 'not_found' }, { status: 404 });
  }
  if (!audio.meeting_id) {
    return NextResponse.json(
      { error: 'Recording is not attached to a meeting', code: 'no_meeting' },
      { status: 400 },
    );
  }
  if (!audio.storage_path) {
    return NextResponse.json(
      { error: 'Recording has not finished uploading to storage yet', code: 'not_uploaded' },
      { status: 409 },
    );
  }

  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('id, project_title, sub_type, department_id, chair_id, secretary_id, chairperson_id, adviser_id, panel_member_ids')
    .eq('id', audio.meeting_id)
    .single();

  if (meetingError || !meeting) {
    return NextResponse.json({ error: 'Meeting not found', code: 'not_found' }, { status: 404 });
  }

  const { data: department } = meeting.department_id
    ? await supabase.from('departments').select('short, name').eq('id', meeting.department_id).single()
    : { data: null as { short: string; name: string } | null };

  const roleIds = [
    meeting.chair_id,
    meeting.secretary_id,
    meeting.chairperson_id,
    meeting.adviser_id,
    ...(meeting.panel_member_ids ?? []),
  ].filter((id: string | null): id is string => Boolean(id));

  const { data: roleProfiles } = roleIds.length
    ? await supabase.from('profiles').select('name').in('id', roleIds)
    : { data: [] as { name: string }[] };

  const keyterms = buildKeyterms({
    meeting: { project_title: meeting.project_title, sub_type: meeting.sub_type },
    departmentShort: department?.short,
    departmentName: department?.name,
    participantNames: (roleProfiles ?? []).map((p) => p.name),
  });

  // RLS (transcription_jobs_insert) requires `created_by = auth.uid()` and
  // sm_can_edit_meeting_docs(meeting_id) — the same "secretary or admin" gate
  // the plan calls for, enforced by Postgres rather than restated here.
  const { data: job, error: jobInsertError } = await supabase
    .from('transcription_jobs')
    .insert({
      meeting_id: audio.meeting_id,
      audio_id: audio.id,
      requested_language: language === 'auto' ? null : language,
      diarize: true,
      keyterms,
      audio_duration_sec: audio.duration_sec || null,
      created_by: session.userId,
      status: 'queued',
    })
    .select('id')
    .single();

  if (jobInsertError || !job) {
    return NextResponse.json(
      { error: 'Not permitted to transcribe this meeting', code: 'forbidden' },
      { status: 403 },
    );
  }

  const { data: signed, error: signError } = await supabase.storage
    .from('meeting-audio')
    .createSignedUrl(audio.storage_path, SIGNED_URL_TTL_SEC);

  if (signError || !signed) {
    await supabase
      .from('transcription_jobs')
      .update({ status: 'failed', error_code: 'storage_error', error_detail: 'Could not sign a download URL' })
      .eq('id', job.id);
    return NextResponse.json({ error: 'Could not read the recording from storage', code: 'storage_error' }, { status: 502 });
  }

  let provider: AsrProvider;
  try {
    provider = selectProvider(language as AsrLanguage);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'No transcription provider for that language';
    await supabase.from('transcription_jobs').update({ status: 'failed', error_code: 'submit_failed', error_detail: detail }).eq('id', job.id);
    return NextResponse.json({ error: detail, code: 'submit_failed' }, { status: 400 });
  }

  const asrRequest: AsrRequest = {
    audioUrl: signed.signedUrl,
    language: language as AsrLanguage,
    diarize: true,
    keyterms,
    noVerbatim: true,
    webhookRef: job.id,
  };

  const startSync = async () => {
    await supabase
      .from('transcription_jobs')
      .update({ provider: provider.name, model: 'scribe_v2', status: 'processing' })
      .eq('id', job.id);
    after(() => transcribeAndComplete(provider, job.id, asrRequest));
    return NextResponse.json({ jobId: job.id, status: 'processing', delivery: 'sync' }, { status: 202 });
  };

  if (asrDelivery() === 'sync' && provider.transcribe) {
    asrLog('submit', { jobId: job.id, delivery: 'sync', provider: provider.name });
    return startSync();
  }

  try {
    const submission = await provider.submit(asrRequest);

    await supabase
      .from('transcription_jobs')
      .update({
        provider: provider.name,
        provider_job_id: submission.providerJobId,
        model: submission.model,
        status: 'processing',
      })
      .eq('id', job.id);

    asrLog('submit', { jobId: job.id, delivery: 'webhook', provider: provider.name, providerJobId: submission.providerJobId });
    return NextResponse.json({ jobId: job.id, status: 'processing', delivery: 'webhook' }, { status: 202 });
  } catch (err) {
    // No webhook registered in the provider dashboard: transcribe directly
    // instead of failing the upload.
    if (err instanceof AsrProviderError && err.code === 'no_webhooks_configured' && provider.transcribe) {
      asrLog('webhook_unavailable_fallback_sync', { jobId: job.id, provider: provider.name }, 'warn');
      return startSync();
    }

    const detail =
      err instanceof AsrProviderError ? err.message : 'Failed to submit to the transcription provider';
    asrLog('submit_failed', { jobId: job.id, detail: detail.slice(0, 300) }, 'error');

    await supabase
      .from('transcription_jobs')
      .update({ status: 'failed', error_code: 'submit_failed', error_detail: detail })
      .eq('id', job.id);

    return NextResponse.json({ error: detail, code: 'submit_failed' }, { status: 502 });
  }
}
