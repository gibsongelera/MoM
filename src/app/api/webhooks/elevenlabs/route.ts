/**
 * ElevenLabs speech-to-text webhook.
 *
 * Unauthenticated by necessity - ElevenLabs calls this with no Supabase
 * session, so the HMAC signature (provider.verifyWebhook) is the only thing
 * standing between the database and the open internet. Uses the
 * service-role client because there is no user to act as. (The proxy does not
 * run on /api/webhooks, so large signed bodies are not truncated.)
 *
 * Hardening (Oct 2026 audit):
 * - deliveries are at-least-once and can arrive concurrently, so a job is
 *   claimed atomically (raw_response is null -> set) before any transcript is
 *   written; a second concurrent delivery backs off;
 * - a payload we can't use still marks the job failed, so the meeting page
 *   stops showing "transcribing" forever;
 * - every write is checked and logged;
 * - drafting minutes / action items runs after the response via after(), so
 *   the provider isn't kept waiting on Claude.
 *
 * The storing and drafting logic lives in src/lib/asr/complete.ts, shared
 * with the synchronous (no-webhook) path in /api/transcribe.
 */
import { NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProvider } from '@/lib/asr';
import { type Admin, type JobRow, asrLog, completeTranscriptionJob, draftMinutes, failJob } from '@/lib/asr/complete';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Best-effort: find our job for an unusable payload and mark it failed. */
async function failJobFromPayload(supabase: Admin, payload: unknown, detail: string) {
  const data = (payload as { data?: { request_id?: string; webhook_metadata?: { transcriptionJobId?: string } } })?.data;
  let jobId = data?.webhook_metadata?.transcriptionJobId;
  if (!jobId && data?.request_id) {
    const { data: row } = await supabase
      .from('transcription_jobs')
      .select('id')
      .eq('provider', 'elevenlabs')
      .eq('provider_job_id', data.request_id)
      .maybeSingle();
    jobId = row?.id;
  }
  if (jobId) await failJob(supabase, jobId, 'provider_failed', detail);
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const provider = getProvider('elevenlabs');
  if (!provider.verifyWebhook(rawBody, request.headers)) {
    asrLog('webhook_bad_signature', {}, 'warn');
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  const supabase = createAdminClient();

  let result;
  try {
    result = await provider.parseWebhook(payload);
  } catch (err) {
    asrLog('webhook_unparseable', { error: err instanceof Error ? err.message : String(err) }, 'error');
    await failJobFromPayload(supabase, payload, 'The transcription service returned no transcript.');
    // 200 so ElevenLabs stops retrying a payload we can never parse.
    return NextResponse.json({ ok: true, warning: 'unparseable payload' });
  }

  const columns = 'id, meeting_id, audio_id, model, diarize, status';
  const jobQuery = result.webhookRef
    ? supabase.from('transcription_jobs').select(columns).eq('id', result.webhookRef)
    : supabase.from('transcription_jobs').select(columns).eq('provider', provider.name).eq('provider_job_id', result.providerJobId);

  const { data: job, error: jobError } = await jobQuery.maybeSingle();
  if (jobError || !job) {
    asrLog('webhook_unknown_job', { webhookRef: result.webhookRef, providerJobId: result.providerJobId }, 'warn');
    // 200 so the provider stops retrying — the job genuinely does not exist on our side.
    return NextResponse.json({ ok: true, warning: 'unknown job' });
  }

  const outcome = await completeTranscriptionJob(supabase, job as JobRow, result, provider.name, payload);
  switch (outcome.status) {
    case 'skipped':
      return NextResponse.json({ ok: true, note: outcome.note });
    case 'failed':
      return outcome.reason === 'no_speech'
        ? NextResponse.json({ ok: true, warning: 'no speech' })
        : NextResponse.json({ ok: false }, { status: 500 });
    case 'completed':
      // Drafting can take minutes on a long meeting; do it after responding.
      after(() => draftMinutes(supabase, job.meeting_id as string, outcome.folded));
      return NextResponse.json({ ok: true, transcriptId: outcome.transcriptId });
  }
}
