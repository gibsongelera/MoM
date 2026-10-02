'use client';

/**
 * Live recording from the microphone.
 *
 * On stop, the recording uploads and is transcribed in the background, and the
 * secretary goes straight to the meeting's attendance (client: "diretso siya
 * sa attendance"). If the device is offline or the upload fails, the recording
 * stays in memory with "Save recording to this device" and "Retry upload", so
 * nothing is lost and it can be uploaded later from the meeting.
 *
 * Motion: the level meter writes transform: scaleY directly to the bars from
 * requestAnimationFrame (no React re-render 60x a second); it is static under
 * reduced motion. The red dot is steady — the running timer is the live signal.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { uploadAndTranscribe } from '@/lib/utils/uploadAndTranscribe';
import { extensionFor } from '@/lib/meetings/files';
import { fmtManilaDate } from '@/lib/utils/datetime';
import { useOnline } from '@/lib/hooks/useOnline';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/ui/cn';

export interface MeetingOption {
  id: string;
  title: string;
  starts_at: string;
  venue: string | null;
}

type Language = 'auto' | 'eng' | 'fil' | 'ceb';
type Phase = 'idle' | 'recording' | 'paused' | 'stopped' | 'uploading' | 'failed';

const BAR_COUNT = 12;

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

export default function LiveRecordingForm({ meetings, preselectId }: { meetings: MeetingOption[]; preselectId?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [meetingId, setMeetingId] = useState(preselectId ?? meetings[0]?.id ?? '');
  const [language, setLanguage] = useState<Language>('auto');
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // Warn before leaving with an unsaved recording.
  useEffect(() => {
    const unsaved = phase === 'recording' || phase === 'paused' || phase === 'stopped' || phase === 'failed';
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [phase]);

  function resetBars() {
    barsRef.current.forEach((el) => {
      if (el) el.style.transform = 'scaleY(0.2)';
    });
  }

  function meterLoop(analyser: AnalyserNode) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const chunk = Math.floor(data.length / BAR_COUNT) || 1;
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let j = i * chunk; j < (i + 1) * chunk; j++) sum += data[j] ?? 0;
        const level = Math.max(0.15, Math.min(1, sum / chunk / 160));
        const el = barsRef.current[i];
        if (el) el.style.transform = `scaleY(${level})`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  async function start() {
    setError(null);
    chunksRef.current = [];
    blobRef.current = null;
    setElapsed(0);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("SmartMin can't use the microphone. Allow microphone access in your browser, then try again.");
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
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
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
    resetBars();

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

    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
    if (blob.size === 0) {
      setError('No audio was captured. Check the microphone and record again.');
      setPhase('idle');
      return;
    }
    blobRef.current = blob;
    setPhase('stopped');
    await upload();
  }

  async function upload() {
    const blob = blobRef.current;
    if (!blob) return;
    if (!meetingId) {
      setError('Choose the meeting this recording belongs to, then upload.');
      setPhase('failed');
      return;
    }
    if (!navigator.onLine) {
      setError("You're offline, so the recording can't upload yet. Save it to this device, or retry when you're back online.");
      setPhase('failed');
      return;
    }
    setError(null);
    setPhase('uploading');
    try {
      await uploadAndTranscribe(supabase, { meetingId, file: blob, mimeType: blob.type, language });
      blobRef.current = null;
      setPhase('idle');
      toast.success('Recording saved. Transcription continues in the background — take attendance while you wait.');
      router.push(`/secretary/meetings/${meetingId}?step=attendance`);
    } catch (err) {
      setPhase('failed');
      setError(`The recording didn't upload. ${err instanceof Error ? err.message : ''} It's still here — retry or save it to this device.`);
    }
  }

  function saveToDevice() {
    const blob = blobRef.current;
    if (!blob) return;
    const meeting = meetings.find((m) => m.id === meetingId);
    const base = (meeting?.title ?? 'meeting-recording').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${base || 'recording'}.${extensionFor(blob.type)}`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    toast.success('Recording saved to this device. Upload it from the meeting when you are back online.');
  }

  const isRecording = phase === 'recording' || phase === 'paused';
  const hasUnsaved = phase === 'stopped' || phase === 'failed';
  const selectedMeeting = meetings.find((m) => m.id === meetingId) ?? null;

  const statusText =
    phase === 'recording'
      ? 'Recording'
      : phase === 'paused'
        ? 'Paused'
        : phase === 'uploading'
          ? 'Uploading the recording…'
          : phase === 'failed'
            ? 'Not uploaded yet'
            : 'Ready to record';

  return (
    <div className="flex flex-col gap-md">
      <div className="grid grid-cols-1 gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md md:grid-cols-2">
        <Field label="Meeting" required>
          {(p) => (
            <select {...p} className={inputClass} value={meetingId} onChange={(e) => setMeetingId(e.target.value)} disabled={isRecording}>
              {meetings.length === 0 ? <option value="">No meetings yet — schedule one first</option> : null}
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} · {fmtManilaDate(m.starts_at)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Spoken language" hint="Auto-detect handles meetings that switch between English and Filipino.">
          {(p) => (
            <select {...p} className={inputClass} value={language} onChange={(e) => setLanguage(e.target.value as Language)} disabled={isRecording}>
              <option value="auto">Auto-detect</option>
              <option value="eng">English</option>
              <option value="fil">Filipino</option>
              <option value="ceb">Cebuano</option>
            </select>
          )}
        </Field>
      </div>

      <div className="relative flex min-h-[340px] flex-col items-center justify-center gap-lg overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-xl">
        <p className="text-center font-body-md text-on-surface-variant">
          {selectedMeeting ? `${selectedMeeting.title}${selectedMeeting.venue ? ` · ${selectedMeeting.venue}` : ''}` : 'Choose a meeting to record'}
        </p>
        <div className="flex items-center gap-sm">
          <span
            aria-hidden="true"
            className={cn('h-3 w-3 rounded-full', phase === 'recording' ? 'bg-error' : 'bg-on-surface-variant/40')}
          />
          <span className="font-display text-display tabular-nums text-primary" aria-label={`Elapsed time ${fmtTime(elapsed)}`}>
            {fmtTime(elapsed)}
          </span>
        </div>
        <div aria-hidden="true" className="flex h-24 items-end gap-xs">
          {Array.from({ length: BAR_COUNT }, (_, i) => (
            <div
              key={i}
              ref={(el) => {
                barsRef.current[i] = el;
              }}
              className={cn('h-24 w-2 origin-bottom rounded-full', phase === 'recording' ? 'bg-primary' : 'bg-primary/30')}
              style={{ transform: 'scaleY(0.2)', transition: 'transform 90ms linear' }}
            />
          ))}
        </div>
        <p role="status" className="font-h3 text-h3 text-on-surface-variant">
          {statusText}
        </p>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg bg-error-container p-sm font-body-sm text-on-error-container">
          {error}
        </div>
      ) : null}
      {!online && !hasUnsaved ? (
        <p className="rounded-lg bg-tertiary-fixed/40 p-sm font-body-sm text-on-tertiary-fixed-variant">
          You&apos;re offline. You can still record; the recording uploads when you&apos;re back online, or you can save it to this device.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
        {hasUnsaved ? (
          <>
            <Button variant="secondary" icon="download" onClick={saveToDevice}>
              Save recording to this device
            </Button>
            <Button icon="upload" onClick={upload} disabled={!online}>
              Retry upload
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" icon={phase === 'paused' ? 'play_arrow' : 'pause'} onClick={togglePause} disabled={!isRecording}>
              {phase === 'paused' ? 'Resume' : 'Pause'}
            </Button>
            <Button icon="fiber_manual_record" onClick={start} disabled={isRecording || phase === 'uploading' || !meetingId}>
              Start recording
            </Button>
            <Button variant="danger" icon="stop" onClick={stop} disabled={!isRecording}>
              Stop and save
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
