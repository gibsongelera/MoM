/**
 * Faculty personal meetings (personal_meetings + 0018 columns): advising,
 * consultations and one-on-ones, plus the faculty member's own recording of
 * any meeting. Private to the owner (RLS: user_id = auth.uid()).
 */
import type { TranscriptSegment } from '@/lib/types/domain';

export type PersonalStatus = 'scheduled' | 'done' | 'cancelled';
export type PersonalMode = 'in_person' | 'online' | 'phone';
export type TranscriptStatus = 'none' | 'processing' | 'completed' | 'failed';

export interface PersonalMeeting {
  id: string;
  title: string;
  meeting_date: string; // YYYY-MM-DD
  meeting_time: string | null; // HH:MM[:SS]
  type: string | null;
  status: PersonalStatus;
  mode: PersonalMode | null;
  location: string | null;
  duration_min: number | null;
  attendees: string | null;
  purpose: string | null;
  notes: string | null;
  outcome: string | null;
  follow_up_date: string | null;
  meeting_id: string | null;
  archived_at: string | null;
  audio_path: string | null;
  audio_mime: string | null;
  audio_size_bytes: number | null;
  transcript_status: TranscriptStatus;
  transcript_error: string | null;
  transcript_language: string | null;
  transcribed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PersonalMeetingWithTranscript = PersonalMeeting & { transcript_segments: TranscriptSegment[] | null };

/** Every column but the (large) transcript. */
export const PERSONAL_COLUMNS =
  'id, title, meeting_date, meeting_time, type, status, mode, location, duration_min, attendees, purpose, notes, outcome, ' +
  'follow_up_date, meeting_id, archived_at, audio_path, audio_mime, audio_size_bytes, transcript_status, transcript_error, ' +
  'transcript_language, transcribed_at, created_at, updated_at';

export const PERSONAL_TYPES = [
  'Advising',
  'Consultation',
  'Thesis / capstone advising',
  'Student conference',
  'Parent conference',
  'Committee work',
  'Department meeting',
  'One-on-one',
  'Other',
] as const;

export const STATUS_LABEL: Record<PersonalStatus, string> = { scheduled: 'Scheduled', done: 'Done', cancelled: 'Cancelled' };
export const MODE_LABEL: Record<PersonalMode, string> = { in_person: 'In person', online: 'Online', phone: 'Phone call' };
export const TRANSCRIPT_LABEL: Record<TranscriptStatus, string> = {
  none: 'No transcript',
  processing: 'Transcribing…',
  completed: 'Transcript ready',
  failed: 'Transcription failed',
};

/** "2026-10-08" + "14:00:00" → "Oct 8, 2026 · 2:00 PM" (no timezone shift: these are wall-clock values). */
export function fmtPersonalWhen(date: string, time: string | null): string {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  if (!time) return day;
  const [hh, mm] = time.split(':').map(Number);
  const h12 = ((hh + 11) % 12) + 1;
  return `${day} · ${h12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
}

export function fmtBytes(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Plain-text transcript for copy / download. */
export function transcriptToText(title: string, segments: TranscriptSegment[]): string {
  const lines = segments.map((s) => {
    const mm = String(Math.floor(s.t / 60)).padStart(2, '0');
    const ss = String(Math.floor(s.t % 60)).padStart(2, '0');
    return `[${mm}:${ss}] ${s.speaker}: ${s.text}`;
  });
  return `${title}\n\n${lines.join('\n')}\n`;
}
