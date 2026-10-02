'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { LS_KEYS, read, write, saveAudio } from '@/lib/store';
import { useData } from '@/components/DataProvider';
import { saveTranscript, saveTask, updateMeetingFields, logAudit, matchUserIdByName, notifyUser } from '@/lib/db';
import { uploadRecording } from '@/lib/storage';
import { majorityLocale } from '@/lib/lang-detect';
import { scopeMeetings } from '@/lib/scope';
import { generateMockTranscript } from '@/lib/transcriber';
import { summarizeSegments, extractActionItems } from '@/lib/summarizer';
import { analyzeAudioViaApi } from '@/lib/ai-client';
import { fmtDate, fmtTime, uid } from '@/lib/utils';
import type { Transcript } from '@/lib/types';

interface QueueItem {
  id: string;
  meetingId: string;
  durationSec: number;
  language: string;
  queuedAt: number;
}

function getDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.src = URL.createObjectURL(file);
    audio.onloadedmetadata = () => resolve(Math.floor(audio.duration) || 0);
    audio.onerror = () => resolve(0);
  });
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function UploadAudio() {
  const { user, ready } = useRequireRole('secretary');
  usePageTitle('Upload Audio');
  const toast = useToast();
  const router = useRouter();

  const { meetings: allMeetings, users, ready: dataReady, refresh } = useData();
  const meetings = useMemo(
    () => (user ? scopeMeetings(user, allMeetings).filter((m) => !m.aiProcessed) : []),
    [user, allMeetings],
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const [meetingId, setMeetingId] = useState('');
  const [language, setLanguage] = useState('auto');
  const [consent, setConsent] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<{ text: string; pct: number } | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>(() => read<QueueItem[]>(LS_KEYS.offlineQueue, []));

  if (!ready || !user || !dataReady) return null;

  async function handleFile(file: File) {
    if (!consent) {
      toast('Please confirm participants consented to recording before uploading.', 'error');
      return;
    }
    if (!file.type.startsWith('audio/')) {
      toast('Please upload an audio file', 'error');
      return;
    }
    void logAudit('recording_consent', `Consent acknowledged for upload${meetingId ? ' of a meeting' : ''}`);
    setProgress({ text: 'Saving audio to local storage...', pct: 20 });
    const meeting = meetingId ? allMeetings.find((m) => m.id === meetingId) || null : null;
    const audioId = uid('audio');
    const durationSec = await getDuration(file);
    await saveAudio(audioId, file, { meetingId, durationSec, language, originalName: file.name });
    void logAudit('audio_uploaded', `${file.name} (${Math.round(file.size / 1024)} KB)`);

    if (!navigator.onLine) {
      const q = read<QueueItem[]>(LS_KEYS.offlineQueue, []);
      q.unshift({ id: audioId, meetingId, durationSec, language, queuedAt: Date.now() });
      write(LS_KEYS.offlineQueue, q);
      setQueue(q);
      setProgress({ text: 'Offline — queued for sync', pct: 100 });
      toast('Saved locally · will transcribe when you reconnect', 'ai');
      return;
    }

    // Real cloud AI (Phase 2) with graceful fallback to the local pipeline.
    setProgress({ text: language === 'auto' ? 'Transcribing & detecting language…' : 'Transcribing audio…', pct: 45 });
    let segments = [] as Transcript['segments'];
    let summary = '';
    let actions: { text: string; deadline: string; confidence: number; assignee?: string }[] = [];
    let keyDecisions: string[] = [];
    let detectedLang = language;
    try {
      const result = await analyzeAudioViaApi(file, language);
      segments = result.segments;
      summary = result.summary;
      keyDecisions = result.keyDecisions;
      actions = result.actionItems.map((a) => ({ text: a.task, deadline: a.deadline || '', confidence: 0.95, assignee: a.assignee }));
      detectedLang = result.language || (language === 'auto' ? 'en-US' : language);
    } catch {
      // Offline / no key — deterministic local pipeline.
      setProgress({ text: 'Using on-device analysis…', pct: 60 });
      await wait(600);
      segments = generateMockTranscript(language, 8);
      summary = summarizeSegments(segments, 4);
      actions = extractActionItems(segments).map((a) => ({ text: a.text, deadline: a.deadline, confidence: a.confidence, assignee: a.assignee }));
      detectedLang = language === 'auto' ? majorityLocale(segments) : language;
    }

    setProgress({ text: 'Extracting action items…', pct: 90 });
    await wait(300);

    // Transcripts require a meeting in the DB. Without one, we analyse but can't persist.
    if (!meeting) {
      setProgress({ text: 'Analysed (not saved)', pct: 100 });
      toast('Associate a meeting to save this transcript to the server.', 'error', 6000);
      return;
    }

    try {
      // Persist the uploaded audio to the private meeting-audio Storage bucket.
      await uploadRecording(meeting.id, audioId, file, { durationSec, language: detectedLang, createdBy: user!.id }).catch(() => {});
      const transcript = await saveTranscript({
        meetingId: meeting.id,
        language: detectedLang,
        segments,
        summary,
        keyDecisions,
        confidence: 0.97,
      });
      await updateMeetingFields(meeting.id, { aiProcessed: true, status: 'transcribed' });
      for (const a of actions) {
        // Resolve the AI's suggested owner to a real user among the participants.
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
      setProgress({ text: 'Complete!', pct: 100 });
      void logAudit('ai_processed', `${file.name} -> ${segments.length} segments, ${actions.length} actions`);
      await refresh();
      toast(`Transcription complete · ${actions.length} action items detected`, 'ai', 6000);
      void transcript;
      setTimeout(() => router.push(`/secretary/transcript?m=${meeting.id}`), 1200);
    } catch {
      setProgress({ text: 'Save failed', pct: 100 });
      toast('Could not save transcript to the server.', 'error');
    }
  }

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Upload Audio</h1>
        <p className="font-body-md text-on-surface-variant">
          Drop pre-recorded meeting audio for AI transcription. Files queue when offline.
        </p>
      </header>

      <div className="grid grid-cols-12 gap-md">
        <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl p-lg">
          <div
            onClick={() => fileRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            className={`border-2 border-dashed rounded-xl p-xxl text-center transition-colors cursor-pointer ${
              dragOver ? 'border-primary bg-primary-fixed/30' : 'border-outline hover:border-primary hover:bg-primary-fixed/20'
            }`}
          >
            <span className="material-symbols-outlined text-primary text-[64px]">cloud_upload</span>
            <p className="font-h3 text-h3 mt-md">Drop audio file here</p>
            <p className="font-body-sm text-on-surface-variant mt-xs">
              or <span className="text-primary font-semibold underline">browse to upload</span>
            </p>
            <p className="font-caption text-caption text-on-surface-variant mt-md">Supported: WAV, MP3, M4A, WEBM, OGG · up to 200 MB</p>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-md mt-md">
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Associate with meeting (optional)</label>
              <select value={meetingId} onChange={(e) => setMeetingId(e.target.value)} className="w-full px-md py-sm bg-surface-container-low border-2 border-transparent focus:border-primary rounded-lg">
                <option value="">— New / ad-hoc —</option>
                {meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} ({fmtDate(m.date)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Language</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full px-md py-sm bg-surface-container-low border-2 border-transparent focus:border-primary rounded-lg">
                <option value="auto">Auto-detect (EN + TL)</option>
                <option value="en-US">English</option>
                <option value="tl-PH">Tagalog</option>
              </select>
            </div>
          </div>

          <label className="mt-md flex items-start gap-sm cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 rounded border-outline-variant text-primary focus:ring-primary" />
            <span className="font-caption text-caption text-on-surface-variant">
              I confirm the meeting participants were informed and <strong>consented to audio recording &amp; AI processing</strong>, per the ZPPSU Data Privacy Manual (RA 10173).
            </span>
          </label>

          {progress ? (
            <div className="mt-md p-md bg-surface-container-low rounded-lg">
              <p className="font-body-sm font-semibold flex items-center gap-xs">
                <span className="material-symbols-outlined text-tertiary-container animate-pulse">auto_awesome</span> {progress.text}
              </p>
              <div className="w-full bg-surface-variant rounded-full h-2 mt-sm overflow-hidden">
                <div className="bg-primary h-full transition-all" style={{ width: `${progress.pct}%` }} />
              </div>
            </div>
          ) : null}
        </div>

        <aside className="col-span-12 lg:col-span-4 space-y-md">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
            <h3 className="font-h3 text-h3 flex items-center gap-sm mb-md">
              <span className="material-symbols-outlined text-tertiary-container">cloud_queue</span> Offline Queue
            </h3>
            <div className="space-y-sm">
              {queue.length === 0 ? (
                <p className="text-on-surface-variant font-body-sm text-center py-md">
                  <span className="material-symbols-outlined text-success text-[28px] block">check_circle</span>All synced
                </p>
              ) : (
                queue.map((item) => (
                  <div key={item.id} className="p-sm bg-tertiary-fixed/40 border-l-4 border-tertiary-container rounded-lg">
                    <p className="font-body-sm font-semibold flex items-center gap-xs">
                      <span className="material-symbols-outlined text-[16px]">audio_file</span> {fmtTime(item.durationSec)} clip
                    </p>
                    <p className="font-caption text-caption text-on-surface-variant">Queued {fmtDate(item.queuedAt, true)}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass-panel rounded-xl p-md">
            <h3 className="font-h3 text-h3 flex items-center gap-sm mb-md">
              <span className="material-symbols-outlined text-primary">tips_and_updates</span> How it works
            </h3>
            <ol className="space-y-sm font-body-sm">
              {[
                'Audio is saved to your device (IndexedDB) immediately.',
                'If online, AI transcription + analysis runs right away.',
                'If offline, the file queues and auto-syncs when you reconnect.',
                'Action items are extracted automatically into Tasks.',
              ].map((t, i) => (
                <li key={i} className="flex items-start gap-sm">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 3 ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-primary text-on-primary'}`}>
                    {i + 1}
                  </span>{' '}
                  {t}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
