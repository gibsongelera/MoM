/**
 * What happens once an ASR provider hands back a transcript — shared by the
 * webhook (/api/webhooks/elevenlabs) and the synchronous path in
 * /api/transcribe (used when no webhook can reach us, e.g. localhost).
 *
 * Server-only: runs with the service-role client because neither path has a
 * user session at the point the transcript arrives.
 *
 * Every step logs one structured line prefixed `[asr]` with the job id, so a
 * stuck "transcribing" meeting can be traced from the dev-server log alone.
 */
import 'server-only';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { foldWordsToSegments } from '@/lib/asr/fold';
import type { AsrProvider, AsrRequest, AsrResult } from '@/lib/asr/types';
import { AsrProviderError } from '@/lib/asr/types';
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
import { chedFromAiDraft, joinMinutes } from '@/lib/minutes/ched';

export type Admin = ReturnType<typeof createAdminClient>;

export interface JobRow {
  id: string;
  meeting_id: string;
  audio_id: string;
  model: string | null;
  diarize: boolean;
  status: string;
}

export type CompletionOutcome =
  | { status: 'completed'; transcriptId: string; folded: TranscriptSegment[] }
  | { status: 'skipped'; note: 'already processed' | 'already being processed' }
  | { status: 'failed'; reason: 'no_speech' | 'transcript_insert_failed' };

export function asrLog(event: string, fields: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'info') {
  const line = `[asr] ${event} ${JSON.stringify(fields)}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

function logIfError(jobId: string, label: string, error: { message: string } | null) {
  if (error) asrLog(label, { jobId, error: error.message }, 'error');
}

export async function failJob(supabase: Admin, jobId: string, code: string, detail: string) {
  const { error } = await supabase
    .from('transcription_jobs')
    .update({ status: 'failed', error_code: code, error_detail: detail.slice(0, 2000) })
    .eq('id', jobId)
    .neq('status', 'completed');
  logIfError(jobId, 'could not mark job failed', error);
  asrLog('job_failed', { jobId, code, detail: detail.slice(0, 300) }, 'warn');
}

/**
 * Stores a provider result as the meeting's transcript. Idempotent: the job is
 * claimed atomically (raw_response null -> set) before anything is written, so
 * concurrent or repeated deliveries do nothing.
 */
export async function completeTranscriptionJob(
  supabase: Admin,
  job: JobRow,
  result: AsrResult,
  providerName: string,
  rawPayload: unknown,
): Promise<CompletionOutcome> {
  if (job.status === 'completed') return { status: 'skipped', note: 'already processed' };

  const { data: claimed, error: claimError } = await supabase
    .from('transcription_jobs')
    .update({ raw_response: rawPayload })
    .eq('id', job.id)
    .is('raw_response', null)
    .select('id');
  logIfError(job.id, 'claim failed', claimError);
  if (!claimed?.length) return { status: 'skipped', note: 'already being processed' };

  const folded = foldWordsToSegments(result.words);
  if (folded.length === 0) {
    await failJob(supabase, job.id, 'no_speech', 'No speech was found in the recording.');
    return { status: 'failed', reason: 'no_speech' };
  }

  const { data: transcript, error: transcriptError } = await supabase
    .from('transcripts')
    .insert({
      meeting_id: job.meeting_id,
      language: result.languageCode,
      segments: folded,
      source_audio_id: job.audio_id,
      ai_model: job.model,
      provider: providerName,
      detected_language: result.languageCode,
      diarized: job.diarize,
    })
    .select('id')
    .single();

  if (transcriptError || !transcript) {
    await failJob(supabase, job.id, 'transcript_insert_failed', transcriptError?.message ?? 'unknown');
    return { status: 'failed', reason: 'transcript_insert_failed' };
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
    logIfError(job.id, 'speaker seed failed', error);
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
  logIfError(job.id, 'job completion update failed', jobDoneError);

  const { error: meetingError } = await supabase
    .from('meetings')
    .update({ status: 'transcribed', ai_processed: true })
    .eq('id', job.meeting_id)
    .in('status', ['scheduled', 'recording']);
  logIfError(job.id, 'meeting status update failed', meetingError);

  const { error: auditError } = await supabase.rpc('log_audit', {
    p_action: 'transcript_completed',
    p_detail: `[system] Transcript ${transcript.id} created via ${providerName} for meeting ${job.meeting_id}`,
  });
  logIfError(job.id, 'audit failed', auditError);

  asrLog('job_completed', { jobId: job.id, transcriptId: transcript.id, segments: folded.length, language: result.languageCode });
  return { status: 'completed', transcriptId: transcript.id, folded };
}

/**
 * The synchronous path: ask the provider, wait, then store the result exactly
 * as the webhook would. Meant to run inside after() so the browser isn't held
 * open for a multi-minute transcription; the meeting page follows the job row.
 */
export async function transcribeAndComplete(provider: AsrProvider, jobId: string, req: AsrRequest) {
  const supabase = createAdminClient();
  const startedAt = Date.now();
  asrLog('sync_started', { jobId, provider: provider.name, language: req.language });
  try {
    if (!provider.transcribe) throw new AsrProviderError(provider.name, 'provider has no synchronous mode');
    const result = await provider.transcribe(req);

    const { data: job, error } = await supabase
      .from('transcription_jobs')
      .update({ provider_job_id: result.providerJobId })
      .eq('id', jobId)
      .select('id, meeting_id, audio_id, model, diarize, status')
      .single();
    if (error || !job) {
      asrLog('sync_job_missing', { jobId, error: error?.message }, 'error');
      return;
    }

    const outcome = await completeTranscriptionJob(supabase, job as JobRow, result, provider.name, {
      delivery: 'sync',
      language_code: result.languageCode,
      language_probability: result.languageProbability,
      text: result.text,
      words: result.words,
    });
    asrLog('sync_finished', { jobId, outcome: outcome.status, ms: Date.now() - startedAt });
    if (outcome.status === 'completed') await draftMinutes(supabase, job.meeting_id as string, outcome.folded);
  } catch (err) {
    const detail = err instanceof AsrProviderError ? err.message : err instanceof Error ? err.message : String(err);
    await failJob(supabase, jobId, 'provider_failed', detail);
  }
}

/**
 * Drafts minutes and extracts action items from the new transcript.
 * Best-effort: on failure there is simply no draft yet and the secretary
 * writes one. Never overwrites a document a person has already worked on —
 * an existing draft only receives fresh action-item suggestions.
 */
export async function draftMinutes(supabase: Admin, meetingId: string, folded: TranscriptSegment[]) {
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

    const { data: existing } = await supabase
      .from('minutes')
      .select('id, status, locked_at, call_to_order, agenda_items')
      .eq('meeting_id', meetingId)
      .maybeSingle();
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
        if (error) asrLog('action-item refresh failed', { meetingId, error: error.message }, 'error');
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
      ...joinMinutes(chedFromAiDraft(draft)),
      ai_action_items: extractedItems,
    };
    const { error } = existing
      ? await supabase.from('minutes').update(body).eq('id', existing.id)
      : await supabase.from('minutes').insert({ ...body, meeting_id: meetingId, status: 'draft' });
    if (error) asrLog('minutes draft write failed', { meetingId, error: error.message }, 'error');
    else asrLog('minutes_drafted', { meetingId });
  } catch (err) {
    asrLog('draft-minutes chain failed', { meetingId, error: err instanceof Error ? err.message : String(err) }, 'error');
  }
}

/**
 * A faculty member's own recording (personal_meetings, 0018). Same provider
 * call as the institutional path, but the result is stored only on the
 * owner's row — never as a meeting transcript, and no minutes are drafted.
 */
export async function transcribePersonalRecording(provider: AsrProvider, personalId: string, ownerId: string, req: AsrRequest) {
  const supabase = createAdminClient();
  const startedAt = Date.now();
  asrLog('personal_started', { personalId, provider: provider.name, language: req.language });
  try {
    if (!provider.transcribe) throw new AsrProviderError(provider.name, 'provider has no synchronous mode');
    const result = await provider.transcribe(req);
    const folded = foldWordsToSegments(result.words);
    const { error } = await supabase
      .from('personal_meetings')
      .update(
        folded.length
          ? {
              transcript_status: 'completed',
              transcript_segments: folded,
              transcript_language: result.languageCode,
              transcript_error: null,
              transcribed_at: new Date().toISOString(),
            }
          : { transcript_status: 'failed', transcript_error: 'No speech was found in the recording.' },
      )
      .eq('id', personalId)
      .eq('user_id', ownerId);
    if (error) asrLog('personal_write_failed', { personalId, error: error.message }, 'error');
    asrLog('personal_finished', { personalId, segments: folded.length, ms: Date.now() - startedAt });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    asrLog('personal_failed', { personalId, detail: detail.slice(0, 300) }, 'warn');
    await supabase
      .from('personal_meetings')
      .update({ transcript_status: 'failed', transcript_error: detail.slice(0, 2000) })
      .eq('id', personalId)
      .eq('user_id', ownerId);
  }
}
