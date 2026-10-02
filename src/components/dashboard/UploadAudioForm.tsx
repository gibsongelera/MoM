'use client';

/**
 * Upload a recording made elsewhere (client: "if there's no internet, record
 * first and add it later"). Upload is optional and happens from the meeting.
 *
 * Signed direct upload to Storage, then /api/transcribe; transcription runs in
 * the background and the secretary goes straight to the meeting's attendance.
 */
import { useId, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { uploadAndTranscribe } from '@/lib/utils/uploadAndTranscribe';
import { audioFileProblem } from '@/lib/meetings/files';
import { fmtManilaDate } from '@/lib/utils/datetime';
import { useOnline } from '@/lib/hooks/useOnline';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

export interface MeetingOption {
  id: string;
  title: string;
  starts_at: string;
}

type Language = 'auto' | 'eng' | 'fil' | 'ceb';

export default function UploadAudioForm({
  meetings = [],
  fixedMeetingId,
}: {
  meetings?: MeetingOption[];
  /** When set (inside a meeting's page), the meeting picker is hidden. */
  fixedMeetingId?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const fileHintId = useId();
  const [meetingId, setMeetingId] = useState(fixedMeetingId ?? meetings[0]?.id ?? '');
  const [language, setLanguage] = useState<Language>('auto');
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!meetingId) {
      setProblem('Choose the meeting this recording belongs to.');
      return;
    }
    if (!file) {
      setProblem('Choose an audio file to upload.');
      return;
    }
    const issue = audioFileProblem(file);
    if (issue) {
      setProblem(issue);
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      await uploadAndTranscribe(supabase, { meetingId, file, mimeType: file.type || 'audio/mpeg', language });
      toast.success('Recording uploaded. Transcription continues in the background — take attendance while you wait.');
      router.push(`/secretary/meetings/${meetingId}?step=attendance`);
    } catch (err) {
      setBusy(false);
      setProblem(`The upload didn't finish. ${err instanceof Error ? err.message : ''} Your file is still selected — try again.`);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex max-w-2xl flex-col gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
      {fixedMeetingId ? null : (
        <Field label="Meeting" required>
          {(p) => (
            <select {...p} className={inputClass} value={meetingId} onChange={(e) => setMeetingId(e.target.value)}>
              {meetings.length === 0 ? <option value="">No meetings yet — schedule one first</option> : null}
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} · {fmtManilaDate(m.starts_at)}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}

      <Field label="Spoken language" hint="Auto-detect handles meetings that switch between English and Filipino.">
        {(p) => (
          <select {...p} className={inputClass} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
            <option value="auto">Auto-detect</option>
            <option value="eng">English</option>
            <option value="fil">Filipino</option>
            <option value="ceb">Cebuano</option>
          </select>
        )}
      </Field>

      <div className="flex flex-col gap-xs">
        <label htmlFor={`${fileHintId}-file`} className="font-label-caps text-label-caps uppercase text-on-surface-variant">
          Audio file
        </label>
        <input
          id={`${fileHintId}-file`}
          type="file"
          accept="audio/*"
          aria-describedby={fileHintId}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setProblem(null);
          }}
          className="block w-full font-body-sm file:mr-sm file:min-h-8 file:rounded-lg file:border file:border-outline file:bg-surface-container-lowest file:px-sm file:font-semibold file:text-on-surface"
        />
        <p id={fileHintId} className="font-caption text-caption text-on-surface-variant">
          MP3, M4A, WAV, OGG or WEBM, up to 500 MB.
        </p>
      </div>

      {problem ? (
        <p role="alert" className="rounded-lg bg-error-container p-sm font-body-sm text-on-error-container">
          {problem}
        </p>
      ) : null}
      {!online ? (
        <p className="rounded-lg bg-tertiary-fixed/40 p-sm font-body-sm text-on-tertiary-fixed-variant">
          You&apos;re offline. Uploading and transcription need an internet connection — keep the file and upload it when you&apos;re back
          online.
        </p>
      ) : null}

      <div>
        <Button type="submit" icon="upload" loading={busy} disabled={!online || !meetingId}>
          {busy ? 'Uploading…' : 'Upload and transcribe'}
        </Button>
      </div>
    </form>
  );
}
