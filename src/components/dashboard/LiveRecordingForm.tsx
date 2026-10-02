'use client';

/**
 * Port of secretary/live-recording.html.
 *
 * The legacy page faked live transcription with the browser Web Speech API
 * (real-time, but low-accuracy and English-only) then threw that away and
 * generated a canned mock transcript on stop. There is no live-STT step here
 * - real accuracy comes from ElevenLabs Scribe v2, which is async by design
 * (webhook-delivered), so this page keeps the record/visualize/timer UI but
 * feeds the stop-time Blob into the same upload -> /api/transcribe -> poll
 * pipeline as UploadAudioForm, via the shared uploadAndTranscribe() helper.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { uploadAndTranscribe } from '@/lib/utils/uploadAndTranscribe';
import type { TranscriptionStatus } from '@/lib/types/domain';

export interface MeetingOption {
  id: string;
  title: string;
  starts_at: string;
  venue: string | null;
}

const BAR_COUNT = 10;
const STATUS_LABEL: Record<TranscriptionStatus, string> = {
  queued: 'Queued',
  uploading: 'Uploading',
  processing: 'Processing with ElevenLabs',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};
const POLL_INTERVAL_MS = 4000;

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

type Phase = 'idle' | 'recording' | 'paused' | 'stopped' | 'submitting' | 'polling' | 'done' | 'error';

export default function LiveRecordingForm({ meetings }: { meetings: MeetingOption[] }) {
  const supabase = createClient();
  const [meetingId, setMeetingId] = useState(meetings[0]?.id ?? '');
  const [language, setLanguage] = useState<'auto' | 'eng' | 'fil' | 'ceb'>('auto');
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0.2));
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<TranscriptionStatus | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  function meterLoop(analyser: AnalyserNode) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    function tick() {
      analyser.getByteFrequencyData(data);
      const bands: number[] = [];
      const chunk = Math.floor(data.length / BAR_COUNT) || 1;
      for (let i = 0; i < BAR_COUNT; i++) {
        const slice = data.slice(i * chunk, (i + 1) * chunk);
        const avg = slice.reduce((a, b) => a + b, 0) / (slice.length || 1);
        bands.push(Math.max(0.15, Math.min(1.8, avg / 90)));
      }
      setLevels(bands);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  async function start() {
    setError(null);
    setJobId(null);
    setJobStatus(null);
    chunksRef.current = [];
    setElapsed(0);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone access denied. Allow microphone access to record.');
      return;
    }
    streamRef.current = stream;

    const mimeType = pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start(1000);
    recorderRef.current = recorder;

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    source.connect(analyser);
    meterLoop(analyser);

    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    setPhase('recording');
  }

  function togglePause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === 'recording') {
      recorder.pause();
      if (timerRef.current) clearInterval(timerRef.current);
      setPhase('paused');
    } else if (recorder.state === 'paused') {
      recorder.resume();
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      setPhase('recording');
    }
  }

  async function stop() {
    const recorder = recorderRef.current;
    if (!recorder) return;

    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setLevels(Array(BAR_COUNT).fill(0.2));

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.stop();
    await stopped;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    await audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    recorderRef.current = null;

    const mimeType = recorder.mimeType || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type: mimeType });
    setPhase('stopped');

    if (!meetingId) {
      setError('Choose a meeting before recording so this can be filed correctly.');
      setPhase('error');
      return;
    }
    if (blob.size === 0) {
      setError('No audio was captured.');
      setPhase('error');
      return;
    }

    setPhase('submitting');
    try {
      const { jobId: newJobId } = await uploadAndTranscribe(supabase, { meetingId, file: blob, mimeType, language });
      setJobId(newJobId);
      setJobStatus('processing');
      setPhase('polling');
      pollRef.current = setInterval(async () => {
        const { data } = await supabase.from('transcription_jobs').select('status, error_detail').eq('id', newJobId).single();
        if (!data) return;
        setJobStatus(data.status);
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase(data.status === 'completed' ? 'done' : 'error');
          if (data.status === 'failed') setError(data.error_detail ?? 'Transcription failed.');
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setPhase('error');
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  }

  const isRecording = phase === 'recording' || phase === 'paused';
  const selectedMeeting = meetings.find((m) => m.id === meetingId) ?? null;

  return (
    <div>
      <header className="flex justify-between items-center mb-lg bg-surface-container-lowest border border-outline-variant rounded-xl p-md shadow-sm flex-wrap gap-md">
        <div>
          <div className="flex items-center gap-sm mb-xs">
            <span className="relative flex h-3 w-3">
              <span className={`absolute inline-flex h-full w-full rounded-full ${phase === 'recording' ? 'bg-error opacity-75 record-dot' : 'bg-on-surface-variant opacity-30'}`} />
              <span className={`relative inline-flex rounded-full h-3 w-3 ${phase === 'recording' ? 'bg-error' : 'bg-on-surface-variant'}`} />
            </span>
            <h2 className="font-h3 text-h3">{selectedMeeting?.title ?? 'Quick Recording'}</h2>
          </div>
          <p className="font-body-sm text-on-surface-variant">
            {selectedMeeting ? `${new Date(selectedMeeting.starts_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} · ${selectedMeeting.venue || 'No venue'}` : 'Select a meeting to record'}
          </p>
        </div>
        <div className="flex items-center gap-md">
          <select
            value={meetingId}
            onChange={(e) => setMeetingId(e.target.value)}
            disabled={isRecording}
            className="bg-surface-container border-transparent focus:border-primary rounded-lg py-xs px-md text-body-sm"
          >
            {meetings.length === 0 ? <option value="">No meetings - schedule one first</option> : null}
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as typeof language)}
            disabled={isRecording}
            className="bg-surface-container border-transparent focus:border-primary rounded-lg py-xs px-md text-body-sm"
          >
            <option value="auto">Auto-detect</option>
            <option value="eng">English</option>
            <option value="fil">Filipino</option>
            <option value="ceb">Cebuano</option>
          </select>
        </div>
      </header>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm flex flex-col items-center justify-center relative overflow-hidden p-xl min-h-[400px]">
        <div className="absolute top-md left-0 w-full flex justify-center z-10">
          <div className="font-display text-display text-primary bg-surface/80 backdrop-blur-md px-lg py-sm rounded-lg border border-outline-variant/50 shadow-sm">
            {fmtTime(elapsed)}
          </div>
        </div>

        <div className="relative z-10 flex items-end gap-xs h-32 mt-xl">
          {levels.map((lv, i) => (
            <div
              key={i}
              className={`w-2 rounded-full ${phase === 'recording' ? 'bg-primary' : 'bg-primary/30'}`}
              style={{ height: '2rem', transform: `scaleY(${lv})`, transition: 'transform 100ms ease-out' }}
            />
          ))}
        </div>

        <div className="mt-lg font-h2 text-h2 text-on-surface-variant flex items-center gap-sm z-10">
          {phase === 'idle' ? (
            <>
              <span className="material-symbols-outlined text-[32px]">mic_off</span> Ready to record
            </>
          ) : phase === 'recording' ? (
            <>
              <span className="material-symbols-outlined text-[32px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                mic
              </span>{' '}
              Listening...
            </>
          ) : phase === 'paused' ? (
            <>
              <span className="material-symbols-outlined text-[32px]">pause_circle</span> Paused
            </>
          ) : phase === 'submitting' || phase === 'polling' ? (
            <>
              <span className="material-symbols-outlined text-[32px] text-tertiary-container">auto_awesome</span>{' '}
              {phase === 'submitting' ? 'Uploading...' : jobStatus ? STATUS_LABEL[jobStatus] : 'Processing...'}
            </>
          ) : phase === 'done' ? (
            <>
              <span className="material-symbols-outlined text-[32px] text-success">check_circle</span> Transcription complete
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[32px] text-error">error</span> {error ?? 'Something went wrong'}
            </>
          )}
        </div>
      </div>

      {error ? <div className="mt-md text-error bg-error-container rounded-lg p-sm font-body-sm">{error}</div> : null}

      {phase === 'done' && jobId ? (
        <div className="mt-md bg-success-container text-success rounded-lg p-md flex items-center justify-between gap-md flex-wrap">
          <p className="font-body-sm">Transcript ready. Minutes and action items may already be drafted.</p>
          <div className="flex gap-sm">
            <Link href={`/secretary/transcript?m=${meetingId}`} className="px-md py-xs rounded-lg border border-outline-variant bg-surface font-label-caps text-label-caps">
              Review Transcript
            </Link>
            <Link href={`/secretary/mom-editor?m=${meetingId}`} className="px-md py-xs rounded-lg bg-primary text-on-primary font-label-caps text-label-caps shadow-primary-md">
              Open in MoM Editor
            </Link>
          </div>
        </div>
      ) : null}

      <div className="mt-lg bg-surface/80 backdrop-blur-md border border-outline-variant rounded-xl p-md shadow-md flex justify-center items-center gap-sm">
        <button
          onClick={togglePause}
          disabled={!isRecording}
          className="bg-surface-container hover:bg-surface-container-high text-on-surface px-md py-sm rounded-lg border border-outline-variant font-label-caps text-label-caps flex items-center gap-2 disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[20px]">{phase === 'paused' ? 'play_arrow' : 'pause'}</span> {phase === 'paused' ? 'RESUME' : 'PAUSE'}
        </button>
        <button
          onClick={start}
          disabled={isRecording || phase === 'submitting' || phase === 'polling' || !meetingId}
          className="bg-primary hover:opacity-90 text-on-primary px-lg py-sm rounded-lg font-label-caps text-label-caps flex items-center gap-2 shadow-primary-md disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            fiber_manual_record
          </span>{' '}
          START RECORDING
        </button>
        <button
          onClick={stop}
          disabled={!isRecording}
          className="bg-error hover:opacity-90 text-on-error px-md py-sm rounded-lg font-label-caps text-label-caps flex items-center gap-2 shadow-sm disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            stop
          </span>{' '}
          STOP
        </button>
      </div>
    </div>
  );
}
