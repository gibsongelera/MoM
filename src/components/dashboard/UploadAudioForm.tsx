'use client';

/**
 * Exercises the full Phase 1-5 pipeline built earlier: signed direct upload
 * to Storage (POST /api/audio/upload-url), then POST /api/transcribe to
 * submit to ElevenLabs. The webhook (POST /api/webhooks/elevenlabs) does the
 * rest server-side - this page just submits and then polls
 * transcription_jobs for status, since there's no realtime subscription set
 * up yet and polling is simpler to reason about for a first pass.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { uploadAndTranscribe } from '@/lib/utils/uploadAndTranscribe';
import type { TranscriptionStatus } from '@/lib/types/domain';

export interface MeetingOption {
  id: string;
  title: string;
  starts_at: string;
}

const POLL_INTERVAL_MS = 4000;

const STATUS_LABEL: Record<TranscriptionStatus, string> = {
  queued: 'Queued',
  uploading: 'Uploading',
  processing: 'Processing with ElevenLabs',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export default function UploadAudioForm({ meetings }: { meetings: MeetingOption[] }) {
  const supabase = createClient();
  const [meetingId, setMeetingId] = useState(meetings[0]?.id ?? '');
  const [language, setLanguage] = useState<'auto' | 'eng' | 'fil' | 'ceb'>('auto');
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<TranscriptionStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.from('transcription_jobs').select('status, error_detail').eq('id', id).single();
      if (!data) return;
      setJobStatus(data.status);
      if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
        if (pollRef.current) clearInterval(pollRef.current);
        setStage(data.status === 'completed' ? 'done' : 'error');
        if (data.status === 'failed') setError(data.error_detail ?? 'Transcription failed.');
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!meetingId || !file) {
      setError('Choose a meeting and an audio file.');
      return;
    }
    setError(null);
    setStage('uploading');

    try {
      setStage('submitting');
      const { jobId: newJobId } = await uploadAndTranscribe(supabase, {
        meetingId,
        file,
        mimeType: file.type || 'audio/mpeg',
        language,
      });

      setJobId(newJobId);
      setJobStatus('processing');
      setStage('polling');
      startPolling(newJobId);
    } catch (err) {
      setStage('error');
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg space-y-md max-w-2xl">
      <div>
        <label className="font-label-caps text-label-caps text-on-surface-variant">Meeting</label>
        <select value={meetingId} onChange={(e) => setMeetingId(e.target.value)} className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm">
          {meetings.length === 0 ? <option value="">No meetings yet - schedule one first</option> : null}
          {meetings.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title} · {new Date(m.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="font-label-caps text-label-caps text-on-surface-variant">Spoken language (auto-detect handles code-switching)</label>
        <select value={language} onChange={(e) => setLanguage(e.target.value as typeof language)} className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm">
          <option value="auto">Auto-detect</option>
          <option value="eng">English</option>
          <option value="fil">Filipino</option>
          <option value="ceb">Cebuano</option>
        </select>
      </div>

      <div>
        <label className="font-label-caps text-label-caps text-on-surface-variant">Audio file</label>
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm"
        />
      </div>

      {error ? <div className="text-error bg-error-container rounded-lg p-sm font-body-sm">{error}</div> : null}

      {stage === 'polling' || stage === 'done' ? (
        <div className="bg-tertiary-fixed/30 border border-tertiary-container/40 rounded-lg p-sm flex items-center gap-sm">
          <span className="material-symbols-outlined text-tertiary-container">{stage === 'done' ? 'check_circle' : 'auto_awesome'}</span>
          <div>
            <p className="font-body-sm font-semibold">{jobStatus ? STATUS_LABEL[jobStatus] : 'Submitted'}</p>
            {jobId ? <p className="font-caption text-caption text-on-surface-variant">Job {jobId}</p> : null}
            {stage === 'done' ? (
              <p className="font-caption text-caption text-on-surface-variant">
                Transcript, and if Claude drafted them, minutes and action items, are ready.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={stage === 'uploading' || stage === 'submitting' || stage === 'polling' || !meetingId}
        className="bg-primary text-on-primary px-lg py-sm rounded-lg shadow-primary-md font-semibold disabled:opacity-60"
      >
        {stage === 'uploading'
          ? 'Uploading...'
          : stage === 'submitting'
            ? 'Submitting to ElevenLabs...'
            : stage === 'polling'
              ? 'Transcribing...'
              : 'Upload & Transcribe'}
      </button>
    </form>
  );
}