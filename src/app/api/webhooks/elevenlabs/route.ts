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
 */
import { NextResponse, after } from 'next/server';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProvider } from '@/lib/asr';
import { foldWordsToSegments } from '@/lib/asr/fold';
import type { TranscriptSegment } from '@/lib/types/domain';
import { MAX_TOKENS_JSON, MAX_TOKENS_STREAM, MODEL, getClaude } from '@/lib/ai/claude';
import { docTitleFor } from '@/lib/ai/doc-title';
import {
  ACTION_ITEMS_SYSTEM,
  MINUTES_SYSTEM,
  cachedUserTurn,
  formatTranscript,
  meetingContext,
  systemBlocks,
} from '@/lib/ai/prompts';
import { actionItemsOutput, minutesOutput } from '@/lib/ai/schemas';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Admin = ReturnType<typeof createAdminClient>;

function logIfError(label: string, error: { message: string } | null) {
  if (error) console.error(`elevenlabs webhook: ${label}`, error.message);
}

/** Best-effort: find our job for an unusable payload and mark it failed. */
async function failJobFromPayload(supabase: Admin, payload: unknown, detail: string) {
  const data = (payload as { data?: { request_id?: string; webhook_metadata?: { transcriptionJobId?: string } } })?.data;
  const ref = data?.webhook_metadata?.transcriptionJobId;
  const query = ref
    ? supabase.from('transcription_jobs').update({ status: 'failed', error_code: 'provider_failed', error_detail: detail }).eq('id', ref)
    : data?.request_id
      ? supabase
          .from('transcription_jobs')
          .update({ status: 'failed', error_code: 'provider_failed', error_detail: detail })
          .eq('provider', 'elevenlabs')
          .eq('provider_job_id', data.request_id)
      : null;
  if (!query) return;
  const { error } = await query.neq('status', 'completed');
  logIfError('could not mark job failed', error);
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const provider = getProvider('elevenlabs');
  if (!provider.verifyWebhook(rawBody, request.headers)) {
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
    console.error('elevenlabs webhook: failed to parse payload', err);
    await failJobFromPayload(supabase, payload, 'The transcription service returned no transcript.');
    // 200 so ElevenLabs stops retrying a payload we can never parse.
    return NextResponse.json({ ok: true, warning: 'unparseable payload' });
  }

  const jobQuery = result.webhookRef
    ? supabase.from('transcription_jobs').select('*').eq('id', result.webhookRef)
    : supabase.from('transcription_jobs').select('*').eq('provider', provider.name).eq('provider_job_id', result.providerJobId);

  const { data: job, error: jobError } = await jobQuery.maybeSingle();
  if (jobError || !job) {
    console.warn('elevenlabs webhook: no matching transcription_jobs row', {
      webhookRef: result.webhookRef,
      providerJobId: result.providerJobId,
    });
    // 200 so the provider stops retrying — the job genuinely does not exist on our side.
    return NextResponse.json({ ok: true, warning: 'unknown job' });
  }

  if (job.status === 'completed') {
    return NextResponse.json({ ok: true, note: 'already processed' });
  }

  // Atomic claim: only the delivery that stores the raw payload proceeds.
  // Storing it first also means a folding bug never costs a re-transcription.
  const { data: claimed, error: claimError } = await supabase
    .from('transcription_jobs')
    .update({ raw_response: payload })
    .eq('id', job.id)
    .is('raw_response', null)
    .select('id');
  logIfError('claim failed', claimError);
  if (!claimed?.length) {
    return NextResponse.json({ ok: true, note: 'already being processed' });
  }

  const folded = foldWordsToSegments(result.words);
  if (folded.length === 0) {
    const { error } = await supabase
      .from('transcription_jobs')
      .update({ status: 'failed', error_code: 'no_speech', error_detail: 'No speech was found in the recording.' })
      .eq('id', job.id);
    logIfError('could not mark empty job failed', error);
    return NextResponse.json({ ok: true, warning: 'no speech' });
  }

  const { data: transcript, error: transcriptError } = await supabase
    .from('transcripts')
    .insert({
      meeting_id: job.meeting_id,
      language: result.languageCode,
      segments: folded,
      source_audio_id: job.audio_id,
      ai_model: job.model,
      provider: provider.name,
      detected_language: result.languageCode,
      diarized: job.diarize,
    })
    .select('id')
    .single();

  if (transcriptError || !transcript) {
    const { error } = await supabase
      .from('transcription_jobs')
      .update({ status: 'failed', error_code: 'transcript_insert_failed', error_detail: transcriptError?.message ?? 'unknown' })
      .eq('id', job.id);
    logIfError('could not mark job failed', error);
    console.error('elevenlabs webhook: failed to insert transcript', transcriptError);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Diarization emits speaker_0, speaker_1... — seed one row per label so a
  // secretary can rename them later without inventing the mapping from scratch.
  const distinctSpeakers = [...new Map(folded.map((s) => [s.speakerId, s.speaker] as const)).entries()].filter(
    (entry): entry is [string, string] => entry[0] !== null,
  );
  if (distinctSpeakers.length) {
    const { error } = await supabase.from('transcript_speakers').insert(
      distinctSpeakers.map(([speaker_label, display_name]) => ({ transcript_id: transcript.id, speaker_label, display_name })),
    );
    logIfError('speaker seed failed', error);
  }

  const { error: jobDoneError } = await supabase
    .from('transcription_jobs')
    .update({
      status: 'completed',
      transcript_id: transcript.id,
      detected_language: result.languageCode,
      language_probability: result.languageProbability,
      completed_at: new Date().toISOString(),
    })
    .eq('id', job.id);
  logIfError('job completion update failed', jobDoneError);

  const { error: meetingError } = await supabase
    .from('meetings')
    .update({ status: 'transcribed', ai_processed: true })
    .eq('id', job.meeting_id)
    .in('status', ['scheduled', 'recording']);
  logIfError('meeting status update failed', meetingError);

  const { error: auditError } = await supabase.rpc('log_audit', {
    p_action: 'transcript_completed',
    p_detail: `[system] Transcript ${transcript.id} created via ${provider.name} for meeting ${job.meeting_id}`,
  });
  logIfError('audit failed', auditError);

  // Drafting can take minutes on a long meeting; do it after responding.
  after(() => draftMinutes(supabase, job.meeting_id as string, folded));

  return NextResponse.json({ ok: true, transcriptId: transcript.id });
}

/**
 * Drafts minutes and extracts action items from the new transcript.
 * Best-effort: on failure there is simply no draft yet and the secretary
 * writes one. Never overwrites a document a person has already worked on —
 * an existing draft only receives fresh action-item suggestions.
 */
async function draftMinutes(supabase: Admin, meetingId: string, folded: TranscriptSegment[]) {
  try {
    const { data: meeting } = await supabase
      .from('meetings')
      .select(
        'title, starts_at, venue, meeting_type, sub_type, project_title, agenda, language, chair_id, secretary_id, ' +
          'chairperson_name, chairperson_id, adviser_name, adviser_id, panel_members',
      )
      .eq('id', meetingId)
      .single();
    if (!meeting) return;
    const m = meeting as unknown as {
      title: string;
      starts_at: string;
      venue: string | null;
      meeting_type: 'regular' | 'capstone' | 'research';
      sub_type: string | null;
      project_title: string | null;
      agenda: string[] | null;
      language: string;
      chair_id: string | null;
      secretary_id: string | null;
      chairperson_name: string | null;
      chairperson_id: string | null;
      adviser_name: string | null;
      adviser_id: string | null;
      panel_members: { name: string }[] | null;
    };

    const roleIds = [m.chair_id, m.secretary_id, m.chairperson_id, m.adviser_id].filter((id): id is string => Boolean(id));
    const { data: roleProfiles } = roleIds.length
      ? await supabase.from('profiles').select('id, name').in('id', roleIds)
      : { data: [] as { id: string; name: string }[] };
    const nameOf = (id: string | null | undefined) => roleProfiles?.find((p) => p.id === id)?.name;

    const context = meetingContext(
      {
        title: m.title,
        starts_at: m.starts_at,
        venue: m.venue,
        meeting_type: m.meeting_type,
        sub_type: m.sub_type,
        project_title: m.project_title,
        agenda: m.agenda ?? [],
        language: m.language,
      },
      {
        chair: m.chairperson_name ?? nameOf(m.chair_id ?? m.chairperson_id),
        secretary: nameOf(m.secretary_id),
        adviser: m.adviser_name ?? nameOf(m.adviser_id),
        panel: (m.panel_members ?? []).map((p) => p.name).filter(Boolean),
      },
    );
    const transcriptText = formatTranscript(folded);
    const claude = getClaude();

    const { data: existing } = await supabase.from('minutes').select('id, status, locked_at, call_to_order, agenda_items').eq('meeting_id', meetingId).maybeSingle();
    const humanTouched =
      existing && (existing.locked_at || existing.status !== 'draft' || existing.call_to_order || (existing.agenda_items as unknown[] | null)?.length);

    const actionItemsMessage = await claude.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS_JSON,
      system: systemBlocks(ACTION_ITEMS_SYSTEM),
      messages: cachedUserTurn(context, transcriptText, 'Extract the action items from this meeting.'),
      output_config: { format: zodOutputFormat(actionItemsOutput) },
    });
    const extractedItems = actionItemsMessage.stop_reason !== 'refusal' ? (actionItemsMessage.parsed_output?.items ?? []) : [];

    if (existing) {
      if (!existing.locked_at) {
        const { error } = await supabase.from('minutes').update({ ai_action_items: extractedItems }).eq('id', existing.id);
        logIfError('action-item refresh failed', error);
      }
      if (humanTouched) return;
    }

    const minutesStream = claude.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS_STREAM,
      system: systemBlocks(MINUTES_SYSTEM),
      messages: cachedUserTurn(context, transcriptText, 'Draft the Minutes of the Meeting for this session.'),
      output_config: { format: zodOutputFormat(minutesOutput) },
    });
    const minutesMessage = await minutesStream.finalMessage();
    if (minutesMessage.stop_reason === 'refusal') return;
    const text = minutesMessage.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return;
    const validated = minutesOutput.safeParse(JSON.parse(text.text));
    if (!validated.success) return;
    const draft = validated.data;

    const body = {
      document_title: docTitleFor({ title: m.title, meeting_type: m.meeting_type, sub_type: m.sub_type, project_title: m.project_title }),
      call_to_order: draft.callToOrder,
      previous_minutes: draft.previousMinutes,
      agenda_items: draft.agendaItems,
      adjournment: draft.adjournment,
      ai_action_items: extractedItems,
    };
    const { error } = existing
      ? await supabase.from('minutes').update(body).eq('id', existing.id)
      : await supabase.from('minutes').insert({ ...body, meeting_id: meetingId, status: 'draft' });
    logIfError('minutes draft write failed', error);
  } catch (err) {
    console.error('elevenlabs webhook: draft-minutes/action-items chain failed', err);
  }
}
