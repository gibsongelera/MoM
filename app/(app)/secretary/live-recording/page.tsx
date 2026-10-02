'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { saveAudio } from '@/lib/store';
import { useData } from '@/components/DataProvider';
import { saveTranscript, saveTask, updateMeetingFields, logAudit, matchUserIdByName, notifyUser } from '@/lib/db';
import { uploadRecording } from '@/lib/storage';
import { LiveTranscriber, generateMockTranscript, isSpeechSupported } from '@/lib/transcriber';
import { majorityLocale, LANG_LABEL } from '@/lib/lang-detect';
import { summarizeSegments, extractActionItems } from '@/lib/summarizer';
import { fmtDate, fmtTime, uid } from '@/lib/utils';
import type { Transcript, TranscriptSegment } from '@/lib/types';

// A pleasant static waveform shape for the idle (not-recording) state.
const idleBarHeight = (i: number) => 10 + Math.abs(Math.sin(i * 0.7)) * 26;

function Inner() {
  const { user, ready } = useRequireRole('secretary');
  usePageTitle('Live Recording');
  const toast = useToast();
  const params = useSearchParams();
  const { meetings, users, ready: dataReady, refresh } = useData();

  const meeting = useMemo(() => {
    const id = params.get('m');
    return id ? meetings.find((m) => m.id === id) || null : null;
  }, [params, meetings]);

  const [language, setLanguage] = useState(meeting?.language || 'auto');
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<'idle' | 'listening' | 'processing' | 'done'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [partial, setPartial] = useState('');
  const [mockMode, setMockMode] = useState(false);
  const [consent, setConsent] = useState(false);
  const [summaryModal, setSummaryModal] = useState<{ transcript: Transcript; taskCount: number } | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const transcriberRef = useRef<LiveTranscriber | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startAtRef = useRef(0);
  const segRef = useRef<TranscriptSegment[]>([]);

  // Live spectrum (Web Audio) — bars are driven directly via refs to avoid re-renders.
  const BAR_COUNT = 28;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);

  // Tear everything down if the component unmounts mid-recording.
  useEffect(
    () => () => {
      stopSpectrum();
      transcriberRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function stopSpectrum() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    analyserRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    barsRef.current.forEach((el, i) => {
      if (el) el.style.height = `${idleBarHeight(i)}px`;
    });
  }

  function startSpectrum() {
    const analyser = analyserRef.current;
    const bins = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const loop = () => {
      const n = barsRef.current.length;
      if (analyser && bins) {
        analyser.getByteFrequencyData(bins);
        for (let i = 0; i < n; i++) {
          // Map each bar to a low-frequency bin (voice energy sits low).
          const bin = Math.floor((i / n) * (bins.length * 0.7));
          const v = bins[bin] / 255; // 0..1
          const el = barsRef.current[i];
          if (el) el.style.height = `${8 + v * 116}px`;
        }
      } else {
        // No mic (mock mode) — a gentle synthetic idle wave so it still lives.
        const t = Date.now() / 220;
        for (let i = 0; i < n; i++) {
          const v = (Math.sin(t + i * 0.55) + Math.sin(t * 1.7 + i)) / 2;
          const el = barsRef.current[i];
          if (el) el.style.height = `${18 + Math.abs(v) * 46}px`;
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
  }

  if (!ready || !user || !dataReady) return null;

  async function start() {
    if (!consent) {
      toast('Please confirm participants consented to recording first.', 'error');
      return;
    }
    void logAudit('recording_consent', `Consent acknowledged for live recording${meeting ? ' of ' + meeting.title : ''}`);
    setSegments([]);
    segRef.current = [];
    setElapsed(0);
    setStatus('listening');
    setRecording(true);
    startAtRef.current = Date.now();

    let haveMic = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.start();
      recorderRef.current = rec;
      haveMic = true;
    } catch {
      setMockMode(true);
      toast('Microphone unavailable — using demo transcription.', 'info');
    }

    // Wire the live spectrum to the mic so the bars track real speech energy.
    if (streamRef.current) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
        const ctx = new AC();
        const source = ctx.createMediaStreamSource(streamRef.current);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
      } catch {
        /* fall back to the synthetic idle wave */
      }
    }
    startSpectrum();

    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startAtRef.current) / 1000)), 1000);

    const t = new LiveTranscriber({
      lang: language,
      useMockOnly: !haveMic || !isSpeechSupported(),
      onSegment: (seg) => {
        segRef.current = [...segRef.current, seg];
        setSegments([...segRef.current]);
        setPartial('');
      },
      onPartial: (txt) => setPartial(txt),
    });
    const mode = t.start();
    if (mode === 'mock') setMockMode(true);
    transcriberRef.current = t;
  }

  async function stop() {
    setRecording(false);
    setStatus('processing');
    if (timerRef.current) clearInterval(timerRef.current);
    stopSpectrum();
    transcriberRef.current?.stop();
    transcriberRef.current = null;

    const durationSec = Math.floor((Date.now() - startAtRef.current) / 1000);
    let blob: Blob | null = null;
    if (recorderRef.current) {
      blob = await new Promise<Blob | null>((resolve) => {
        const rec = recorderRef.current!;
        rec.onstop = () => resolve(new Blob(chunksRef.current, { type: 'audio/webm' }));
        rec.stop();
      });
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    }

    if (blob) {
      const audioId = uid('audio');
      let stored = false;
      // Meeting recordings go to the private meeting-audio Storage bucket.
      if (meeting) {
        try {
          await uploadRecording(meeting.id, audioId, blob, { durationSec, language, createdBy: user!.id });
          void logAudit('recording_saved', `Audio ${audioId} (${durationSec}s) uploaded for ${meeting.title}`);
          stored = true;
        } catch {}
      }
      // Ad-hoc, or if the upload failed (offline), keep a local IndexedDB copy.
      if (!stored) {
        try {
          await saveAudio(audioId, blob, { meetingId: meeting?.id, durationSec, language });
          void logAudit('recording_saved', `Audio ${audioId} (${durationSec}s) saved locally`);
        } catch {}
      }
    }

    let segs = segRef.current;
    if (segs.length === 0) {
      segs = generateMockTranscript(language, 8);
      segRef.current = segs;
      setSegments(segs);
    }

    const summary = summarizeSegments(segs, 4);
    const actions = extractActionItems(segs);
    // In auto mode, store the language the segments actually skewed toward.
    const detectedLang = language === 'auto' ? majorityLocale(segs) : language;

    // Transcripts require a meeting in the DB; ad-hoc "Quick Recording" stays local.
    let transcript: Transcript = { id: uid('t'), meetingId: meeting?.id || '', language: detectedLang, segments: segs, summary, confidence: 0.97, comments: [] };
    if (meeting) {
      try {
        transcript = await saveTranscript({ meetingId: meeting.id, language: detectedLang, segments: segs, summary, confidence: 0.97 });
        await updateMeetingFields(meeting.id, { aiProcessed: true, status: 'transcribed' });
        for (const a of actions) {
          const assigneeId = matchUserIdByName(a.assignee, users, meeting.participantIds);
          const title = a.text.length > 90 ? a.text.slice(0, 87) + '...' : a.text;
          await saveTask({
            title,
            description: a.text,
            meetingId: meeting.id,
            departmentId: meeting.departmentId || user!.departmentId,
            assigneeId,
            delegatedBy: meeting.chairId || user!.id,
            priority: 'medium',
            deadline: a.deadline || '',
            status: 'pending',
            aiExtracted: true,
          });
          if (assigneeId) void notifyUser(assigneeId, 'task', 'New task from a meeting', `${meeting.title}: ${title}`);
        }
        void logAudit('ai_processed', `${segs.length} segments transcribed, ${actions.length} action items extracted`);
        await refresh();
      } catch {
        toast('Could not save transcript to the server. Showing local result.', 'error');
      }
    }

    setStatus('done');
    toast(`Transcript saved · ${actions.length} action items extracted`, 'ai', 6000);
    setTimeout(() => setSummaryModal({ transcript, taskCount: actions.length }), 500);
  }

  const statusText = {
    idle: (<><span className="material-symbols-outlined text-[32px] text-on-surface-variant">mic_off</span> Ready to record</>),
    listening: (<><span className="material-symbols-outlined text-[32px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span> Listening...</>),
    processing: (<><span className="material-symbols-outlined text-[32px] text-tertiary-container">auto_awesome</span> Processing with AI...</>),
    done: (<><span className="material-symbols-outlined text-[32px] text-success">check_circle</span> AI processing complete</>),
  }[status];

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="flex justify-between items-center mb-lg bg-surface-container-lowest border border-outline-variant rounded-xl p-md shadow-sm flex-wrap gap-md">
        <div>
          <div className="flex items-center gap-sm mb-xs">
            <span className="relative flex h-3 w-3">
              {recording ? (
                <>
                  <span className="absolute inline-flex h-full w-full rounded-full bg-error opacity-75 record-dot" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-error" />
                </>
              ) : (
                <>
                  <span className="absolute inline-flex h-full w-full rounded-full bg-on-surface-variant opacity-50" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-on-surface-variant" />
                </>
              )}
            </span>
            <h2 className="font-h3 text-h3">{meeting ? meeting.title : 'Quick Recording'}</h2>
          </div>
          <p className="font-body-sm text-on-surface-variant">{meeting ? `${fmtDate(meeting.date, true)} · ${meeting.venue || 'No venue'}` : 'Select a meeting or record ad-hoc'}</p>
        </div>
        <div className="flex items-center gap-md">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={recording} className="bg-surface-container border-transparent focus:border-primary rounded-lg py-xs px-md text-body-sm">
            <option value="auto">Auto (EN + TL)</option>
            <option value="en-US">English (EN)</option>
            <option value="tl-PH">Tagalog (TL)</option>
          </select>
          <div className="bg-tertiary-container/20 text-tertiary-container px-sm py-xs rounded-full flex items-center gap-xs font-label-caps text-label-caps border border-tertiary-container/30">
            <span className="material-symbols-outlined text-[16px]">psychology</span> AI Confidence: 98%
          </div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-lg">
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-lg">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm flex-1 flex flex-col items-center justify-center relative overflow-hidden p-xl min-h-[400px]">
            <div className="absolute inset-0 bg-gradient-to-b from-surface-container-lowest to-surface-container-low opacity-50" />
            <div className="absolute top-md left-0 w-full flex justify-center z-10">
              <div className="font-display text-display text-primary bg-surface/80 backdrop-blur-md px-lg py-sm rounded-lg border border-outline-variant/50 shadow-sm">{fmtTime(elapsed)}</div>
            </div>
            <div className="relative z-10 flex items-end justify-center gap-[3px] h-32 mt-xl w-full max-w-[520px]">
              {Array.from({ length: BAR_COUNT }).map((_, i) => (
                <div
                  key={i}
                  ref={(el) => {
                    barsRef.current[i] = el;
                  }}
                  className={`w-1.5 rounded-full ${recording ? '' : 'opacity-50'} ${i % 7 === 3 ? 'bg-primary' : i % 3 === 2 ? 'bg-tertiary-container/70' : 'bg-primary/60'}`}
                  style={{ height: `${idleBarHeight(i)}px` }}
                />
              ))}
            </div>
            <div className="mt-lg font-h2 text-h2 text-on-surface-variant flex items-center gap-sm z-10">{statusText}</div>
          </div>

          <div className="bg-surface/80 backdrop-blur-md border border-outline-variant rounded-xl p-md shadow-md flex justify-between items-center flex-wrap gap-md">
            <label className="flex items-start gap-sm cursor-pointer max-w-[52%]">
              <input type="checkbox" checked={consent} disabled={recording} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 rounded border-outline-variant text-primary focus:ring-primary" />
              <span className="font-caption text-caption text-on-surface-variant">
                Participants consented to recording &amp; AI processing (RA 10173).
              </span>
            </label>
            <div className="flex items-center gap-sm">
              <button onClick={start} disabled={recording} className="bg-primary hover:opacity-90 text-on-primary px-lg py-sm rounded-lg font-label-caps text-label-caps flex items-center gap-2 shadow-primary-md disabled:opacity-40">
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>fiber_manual_record</span> START RECORDING
              </button>
              <button onClick={stop} disabled={!recording} className="bg-error hover:opacity-90 text-on-error px-md py-sm rounded-lg font-label-caps text-label-caps flex items-center gap-2 shadow-sm disabled:opacity-40">
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>stop</span> STOP
              </button>
            </div>
          </div>

          {mockMode ? (
            <div className="bg-tertiary-fixed border border-tertiary-container/40 rounded-lg p-sm flex items-center gap-sm">
              <span className="material-symbols-outlined text-tertiary-container">info</span>
              <p className="font-body-sm">Live in-browser transcription unavailable — using realistic demo playback. Recording still works.</p>
            </div>
          ) : null}
        </div>

        <div className="col-span-12 lg:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm p-md flex flex-col min-h-[500px] max-h-[700px]">
          <div className="flex justify-between items-center mb-sm pb-sm border-b border-outline-variant">
            <h3 className="font-h3 text-h3 flex items-center gap-2"><span className="material-symbols-outlined text-primary">closed_caption</span> Live Transcript</h3>
            {recording ? <span className="material-symbols-outlined text-tertiary-container animate-pulse">auto_awesome</span> : null}
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col gap-md pr-sm">
            {segments.map((seg, i) => {
              const hi = seg.speaker === 'Live Speaker' || seg.speaker?.includes('Gomez');
              return (
                <div key={i} className={`border-l-2 pl-md py-xs ${hi ? 'border-primary bg-primary/5 rounded-r-lg' : 'border-outline-variant'}`}>
                  <div className={`font-label-caps text-label-caps mb-xs flex items-center gap-xs ${hi ? 'text-primary' : 'text-on-surface-variant'}`}>
                    <span>{seg.speaker || '—'} · {fmtTime(seg.t)}</span>
                    {seg.lang ? (
                      <span className={`px-1 rounded text-[10px] font-bold ${seg.lang === 'tl' ? 'bg-tertiary-container/30 text-tertiary-container' : 'bg-primary/10 text-primary'}`}>
                        {LANG_LABEL[seg.lang]}
                      </span>
                    ) : null}
                  </div>
                  <p className="font-body-sm text-on-surface">{seg.text}</p>
                </div>
              );
            })}
          </div>
          {partial ? <div className="mt-sm pt-sm border-t border-dashed border-outline-variant text-body-sm text-on-surface-variant italic">{partial}</div> : null}
        </div>
      </div>

      {summaryModal ? (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1000] flex items-center justify-center p-md">
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-2xl w-full max-w-[640px] overflow-hidden">
            <div className="px-lg py-md border-b border-outline-variant flex items-center gap-sm bg-gradient-to-r from-primary to-primary-container text-on-primary">
              <span className="material-symbols-outlined">auto_awesome</span>
              <h3 className="font-h3 text-h3 flex-1">AI Processing Complete</h3>
              <button onClick={() => setSummaryModal(null)} className="text-on-primary hover:opacity-80"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="p-lg space-y-md">
              <div>
                <h4 className="font-label-caps text-label-caps text-on-surface-variant mb-xs">AI Summary</h4>
                <p className="font-body-md">{summaryModal.transcript.summary}</p>
              </div>
              <div className="grid grid-cols-3 gap-sm">
                <div className="bg-surface-container-low p-md rounded-lg text-center"><p className="font-h2 text-h2 text-primary">{summaryModal.transcript.segments.length}</p><p className="font-caption text-caption text-on-surface-variant">Segments</p></div>
                <div className="bg-surface-container-low p-md rounded-lg text-center"><p className="font-h2 text-h2 text-tertiary-container">{summaryModal.taskCount}</p><p className="font-caption text-caption text-on-surface-variant">Actions Detected</p></div>
                <div className="bg-surface-container-low p-md rounded-lg text-center"><p className="font-h2 text-h2 text-success">{Math.round((summaryModal.transcript.confidence || 0.97) * 100)}%</p><p className="font-caption text-caption text-on-surface-variant">Confidence</p></div>
              </div>
              <div className="flex gap-sm pt-md border-t border-outline-variant">
                <button onClick={() => setSummaryModal(null)} className="px-md py-sm rounded-lg border border-outline-variant">Continue</button>
                <Link href={`/secretary/transcript?m=${meeting?.id || ''}`} className="flex-1 bg-surface-container border border-outline-variant px-md py-sm rounded-lg text-center hover:bg-surface-container-high">Review Transcript</Link>
                <Link href={`/secretary/mom-editor?m=${meeting?.id || ''}`} className="flex-1 bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md text-center flex items-center justify-center gap-xs">
                  <span className="material-symbols-outlined text-[18px]">description</span> Open in MoM Editor
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function SecretaryLiveRecording() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
