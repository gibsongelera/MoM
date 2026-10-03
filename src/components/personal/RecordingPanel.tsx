'use client';

/**
 * A faculty member's own recording for one personal_meetings row: upload a
 * file or record in the browser, then it is transcribed in the background
 * (/api/personal/transcribe). Audio lives in the private `personal-audio`
 * bucket under <userId>/<personalId>/<uuid>.<ext> (owner-only policies, 0018).
 *
 * While a transcript is processing the page refreshes itself every few
 * seconds (no realtime channel on personal_meetings — it is private and
 * low-traffic, so polling is the simpler, cheaper choice).
 *
 * Nothing is lost on a failed upload: the recording stays in memory with
 * "Save to this device" and "Try again".
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { extensionFor, resolveAudioMimeType, audioFileProblem } from '@/lib/meetings/files';
import { fmtBytes, type TranscriptStatus } from '@/lib/personal/types';
import { TranscriptPill } from './TranscriptPill';
import { useOnline } from '@/lib/hooks/useOnline';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/ui/cn';

type Language = 'auto' | 'eng' | 'fil' | 'ceb';

/** Uploads (replacing any earlier recording) and starts transcription. */
export async function uploadPersonalRecording(
  supabase: SupabaseClient,
  params: { personalId: string; userId: string; file: File | Blob; language: Language; previousPath?: string | null },
) {
  const name = params.file instanceof File ? params.file.name : undefined;
  const mimeType = resolveAudioMimeType({ type: params.file.type, name });
  if (!mimeType) throw new Error("That file type isn't supported. Use an audio file such as MP3, M4A, WAV, OGG or WEBM.");
  const body = params.file.type === mimeType ? params.file : params.file.slice(0, params.file.size, mimeType);
  const path = `${params.userId}/${params.personalId}/${crypto.randomUUID()}.${extensionFor(mimeType)}`;

  const { error: uploadError } = await supabase.storage.from('personal-audio').upload(path, body, { contentType: mimeType });
  if (uploadError) throw new Error(uploadError.message);

  const { data: marked, error: markError } = await supabase
    .from('personal_meetings')
    .update({
      audio_path: path,
      audio_mime: mimeType,
      audio_size_bytes: params.file.size,
      audio_uploaded_at: new Date().toISOString(),
      transcript_status: 'none',
      transcript_error: null,
      transcript_segments: null,
      transcribed_at: null,
    })
    .eq('id', params.personalId)
    .select('id');
  if (markError || !marked?.length) {
    await supabase.storage.from('personal-audio').remove([path]);
    throw new Error(markError?.message ?? "Couldn't save the recording to this entry.");
  }
  if (params.previousPath && params.previousPath !== path) {
    await supabase.storage.from('personal-audio').remove([params.previousPath]);
  }
  await startTranscription(params.personalId, params.language);
}

export async function startTranscription(personalId: string, language: Language) {
  const res = await fetch('/api/personal/transcribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ personalMeetingId: personalId, language }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Could not start the transcription.');
}

function pickRecorderType(): string {
  for (const c of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

function fmtClock(sec: number) {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

export default function RecordingPanel({
  personalId,
  userId,
  title,
  audioPath,
  audioSize,
  transcriptStatus,
  transcriptError,
  compact = false,
}: {
  personalId: string;
  userId: string;
  title: string;
  audioPath: string | null;
  audioSize: number | null;
  transcriptStatus: TranscriptStatus;
  transcriptError: string | null;
  /** Smaller layout for embedding (e.g. on a meeting page). */
  compact?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const uid = useId();
  const [mode, setMode] = useState<'idle' | 'upload' | 'record'>(audioPath ? 'idle' : 'upload');
  const [language, setLanguage] = useState<Language>('auto');
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Recorder state
  const [recPhase, setRecPhase] = useState<'idle' | 'recording' | 'paused' | 'stopped'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recorded, setRecorded] = useState<Blob | null>(null);

  // Signed URL for playback of the stored recording.
  useEffect(() => {
    let cancelled = false;
    if (!audioPath) return;
    supabase.storage
      .from('personal-audio')
      .createSignedUrl(audioPath, 3600)
      .then(({ data }) => {
        if (!cancelled) setAudioUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [audioPath, supabase]);

  // Follow a running transcription.
  useEffect(() => {
    if (transcriptStatus !== 'processing') return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [transcriptStatus, router]);

  // Timer + cleanup for the recorder.
  useEffect(() => {
    if (recPhase !== 'recording') return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recPhase]);
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  // Warn before leaving with an unsaved recording.
  useEffect(() => {
    if (!(recPhase === 'recording' || recPhase === 'paused' || (recPhase === 'stopped' && recorded))) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [recPhase, recorded]);

  async function startRecording() {
    setProblem(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setProblem("SmartMin can't use the microphone. Allow microphone access in your browser, then try again.");
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    const type = pickRecorderType();
    const rec = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      setRecorded(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }));
      stream.getTracks().forEach((t) => t.stop());
    };
    rec.start(1000);
    recorderRef.current = rec;
    setElapsed(0);
    setRecorded(null);
    setRecPhase('recording');
  }

  function pauseResume() {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === 'recording') {
      rec.pause();
      setRecPhase('paused');
    } else if (rec.state === 'paused') {
      rec.resume();
      setRecPhase('recording');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecPhase('stopped');
  }

  function saveToDevice(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^\w-]+/g, '-').toLowerCase().slice(0, 60) || 'recording'}.${extensionFor(blob.type)}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function send(blob: File | Blob) {
    const issue = audioFileProblem({ type: blob.type, size: blob.size, name: blob instanceof File ? blob.name : undefined });
    if (issue) {
      setProblem(issue);
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      await uploadPersonalRecording(supabase, { personalId, userId, file: blob, language, previousPath: audioPath });
      toast.success('Recording saved. The transcript will appear here in a moment.');
      setFile(null);
      setRecorded(null);
      setRecPhase('idle');
      setMode('idle');
      router.refresh();
    } catch (err) {
      setProblem(`The upload didn't finish. ${err instanceof Error ? err.message : ''} Your recording is still here — try again or save it to this device.`);
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    setBusy(true);
    try {
      await startTranscription(personalId, language);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the transcription.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby={`${uid}-h`}
      className={cn('rounded-xl border border-outline-variant bg-surface-container-lowest', compact ? 'p-md' : 'p-lg')}
    >
      <div className="mb-md flex flex-wrap items-center justify-between gap-sm">
        <h2 id={`${uid}-h`} className="flex items-center gap-sm font-h3 text-h3">
          <Icon name="graphic_eq" className="text-primary" /> My recording
        </h2>
        {audioPath ? (
          <TranscriptPill status={transcriptStatus} />
        ) : null}
      </div>

      {audioPath ? (
        <div className="mb-md flex flex-col gap-sm">
          {audioUrl ? (
            // Your own recording; the transcript below is its text alternative.
            <audio controls preload="metadata" src={audioUrl} className="w-full" />
          ) : (
            <p className="font-body-sm text-on-surface-variant">Loading the recording…</p>
          )}
          <p className="font-caption text-caption text-on-surface-variant">
            Private to you{audioSize ? ` · ${fmtBytes(audioSize)}` : ''}. Only you can play or download it.
          </p>
          {transcriptStatus === 'failed' ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-sm rounded-lg bg-error-container p-sm font-body-sm text-on-error-container">
              <span>The transcript didn&apos;t finish. {transcriptError ? `(${transcriptError.slice(0, 160)})` : ''}</span>
              <Button size="sm" variant="secondary" icon="refresh" onClick={retry} loading={busy} disabled={!online}>
                Try again
              </Button>
            </div>
          ) : null}
          {transcriptStatus === 'none' ? (
            <div className="flex flex-wrap items-center gap-sm">
              <Button size="sm" icon="closed_caption" onClick={retry} loading={busy} disabled={!online}>
                Transcribe this recording
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-sm">
          <Button variant="secondary" size="sm" icon="upload_file" onClick={() => setMode('upload')}>
            {audioPath ? 'Replace with a file' : 'Upload a file'}
          </Button>
          <Button variant="secondary" size="sm" icon="mic" onClick={() => setMode('record')}>
            {audioPath ? 'Record again' : 'Record now'}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-md rounded-lg border border-outline-variant bg-surface p-md">
          <div className="flex gap-xs" role="tablist" aria-label="How to add the recording">
            {(
              [
                ['upload', 'upload_file', 'Upload a file'],
                ['record', 'mic', 'Record now'],
              ] as const
            ).map(([m, icon, text]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                disabled={recPhase === 'recording' || recPhase === 'paused' || busy}
                onClick={() => setMode(m)}
                className={cn(
                  'inline-flex min-h-9 items-center gap-xs rounded-lg px-sm font-body-sm font-semibold transition-colors duration-150 disabled:opacity-50',
                  mode === m ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container',
                )}
              >
                <Icon name={icon} size={18} /> {text}
              </button>
            ))}
          </div>

          <Field label="Spoken language" hint="Auto-detect handles English–Filipino code-switching.">
            {(p) => (
              <select {...p} className={inputClass} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                <option value="auto">Auto-detect</option>
                <option value="eng">English</option>
                <option value="fil">Filipino</option>
                <option value="ceb">Cebuano</option>
              </select>
            )}
          </Field>

          {mode === 'upload' ? (
            <div className="flex flex-col gap-xs">
              <label htmlFor={`${uid}-file`} className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                Audio file
              </label>
              <input
                id={`${uid}-file`}
                type="file"
                accept="audio/*,.webm,.m4a,.opus,video/webm,video/mp4"
                aria-describedby={`${uid}-file-hint`}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setProblem(null);
                }}
                className="block w-full font-body-sm file:mr-sm file:min-h-8 file:rounded-lg file:border file:border-outline file:bg-surface-container-lowest file:px-sm file:font-semibold file:text-on-surface"
              />
              <p id={`${uid}-file-hint`} className="font-caption text-caption text-on-surface-variant">
                MP3, M4A, WAV, OGG or WEBM (including recordings saved from SmartMin), up to 500 MB.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-sm">
              <div className="flex items-center gap-md">
                <span className={cn('flex h-3 w-3 rounded-full', recPhase === 'recording' ? 'bg-error' : 'bg-outline-variant')} aria-hidden="true" />
                <span className="font-h3 text-h3 tabular-nums" aria-live="off">
                  {fmtClock(elapsed)}
                </span>
                <span className="font-body-sm text-on-surface-variant" role="status">
                  {recPhase === 'recording' ? 'Recording…' : recPhase === 'paused' ? 'Paused' : recPhase === 'stopped' ? 'Stopped — ready to save' : 'Ready'}
                </span>
              </div>
              <div className="flex flex-wrap gap-sm">
                {recPhase === 'idle' || recPhase === 'stopped' ? (
                  <Button size="sm" variant={recPhase === 'stopped' ? 'secondary' : 'primary'} icon="fiber_manual_record" onClick={startRecording} disabled={busy}>
                    {recPhase === 'stopped' ? 'Record again' : 'Start recording'}
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="secondary" icon={recPhase === 'paused' ? 'play_arrow' : 'pause'} onClick={pauseResume}>
                      {recPhase === 'paused' ? 'Resume' : 'Pause'}
                    </Button>
                    <Button size="sm" icon="stop" onClick={stopRecording}>
                      Stop
                    </Button>
                  </>
                )}
                {recorded ? (
                  <Button size="sm" variant="ghost" icon="download" onClick={() => saveToDevice(recorded)}>
                    Save to this device
                  </Button>
                ) : null}
              </div>
            </div>
          )}

          {problem ? (
            <p role="alert" className="rounded-lg bg-error-container p-sm font-body-sm text-on-error-container">
              {problem}
            </p>
          ) : null}
          {!online ? (
            <p className="rounded-lg bg-tertiary-fixed/40 p-sm font-body-sm text-on-tertiary-fixed-variant">
              You&apos;re offline. Keep the recording (Save to this device) and upload it when you&apos;re back online.
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-sm">
            {audioPath ? (
              <Button variant="secondary" size="sm" onClick={() => setMode('idle')} disabled={busy || recPhase === 'recording' || recPhase === 'paused'}>
                Cancel
              </Button>
            ) : null}
            <Button
              size="sm"
              icon="cloud_upload"
              loading={busy}
              disabled={!online || (mode === 'upload' ? !file : !recorded)}
              onClick={() => {
                const blob = mode === 'upload' ? file : recorded;
                if (blob) void send(blob);
              }}
            >
              {busy ? 'Uploading…' : 'Save and transcribe'}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
