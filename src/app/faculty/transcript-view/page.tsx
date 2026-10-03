import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import type { TranscriptSegment } from '@/lib/types/domain';
import { fmtManilaDate } from '@/lib/utils/datetime';
import { fmtPersonalWhen, type TranscriptStatus } from '@/lib/personal/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { buttonClasses } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import TranscriptViewer from '@/components/personal/TranscriptViewer';
import { TranscriptPill } from '@/components/personal/TranscriptPill';
import AskAssistantButton from '@/components/assistant/AskAssistantButton';

export const metadata: Metadata = { title: 'Transcripts | ZPPSU SmartMin' };

/**
 * Faculty transcripts, read-only: official meeting transcripts they can see
 * (RLS) and their own private recordings (personal_meetings, 0018). ?m=
 * opens one official transcript.
 */
export default async function FacultyTranscriptViewPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const user = await requireRole('faculty');
  const { m: meetingId } = await searchParams;
  const supabase = await createClient();

  if (!meetingId) {
    const [{ data: transcripts }, { data: mine }] = await Promise.all([
      supabase.from('transcripts').select('id, meeting_id, language, created_at, meetings(title, starts_at)').order('created_at', { ascending: false }),
      supabase
        .from('personal_meetings')
        .select('id, title, meeting_date, meeting_time, transcript_status, transcript_language, archived_at')
        .eq('user_id', user.id)
        .not('audio_path', 'is', null)
        .order('meeting_date', { ascending: false }),
    ]);
    // A meeting can be transcribed more than once; list each meeting once (latest first).
    const seen = new Set<string>();
    const official = (transcripts ?? []).filter((t) => (seen.has(t.meeting_id) ? false : (seen.add(t.meeting_id), true)));

    return (
      <>
        <header className="mb-lg flex flex-col gap-md md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-h1 text-h1">Transcripts</h1>
            <p className="font-body-lg text-on-surface-variant">Official meeting transcripts you can see, and transcripts of your own recordings.</p>
          </div>
          <Link href="/faculty/personal-meetings?new=recording" className={buttonClasses('primary', 'md', 'pl-sm')}>
            <Icon name="graphic_eq" size={18} /> Upload a recording
          </Link>
        </header>

        <section aria-labelledby="mine-h" className="mb-xl">
          <h2 id="mine-h" className="mb-sm font-h3 text-h3">
            My recordings
          </h2>
          {(mine ?? []).length === 0 ? (
            <EmptyState icon="graphic_eq" title="No recordings yet">
              Upload or record an advising session — or a meeting you attended — to get a private transcript.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant bg-surface-container-lowest">
              {(mine ?? []).map((p) => (
                <li key={p.id}>
                  <Link href={`/faculty/personal-meetings/${p.id}`} className="group flex items-center justify-between gap-sm p-md transition-colors duration-150 hover:bg-surface-container-low">
                    <span className="min-w-0">
                      <span className="block font-body-md font-semibold group-hover:text-primary">{p.title}</span>
                      <span className="block font-caption text-caption text-on-surface-variant">
                        {fmtPersonalWhen(p.meeting_date, p.meeting_time)}
                        {p.transcript_language ? ` · ${p.transcript_language}` : ''}
                        {p.archived_at ? ' · archived' : ''}
                      </span>
                    </span>
                    <span className="flex items-center gap-sm">
                      <TranscriptPill status={p.transcript_status as TranscriptStatus} />
                      <Icon name="chevron_right" className="text-on-surface-variant" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="official-h">
          <h2 id="official-h" className="mb-sm font-h3 text-h3">
            Official meeting transcripts
          </h2>
          {official.length === 0 ? (
            <p className="font-body-sm text-on-surface-variant">No official transcripts yet.</p>
          ) : (
            <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant bg-surface-container-lowest">
              {official.map((t) => {
                // meetings(...) is one embedded row; the untyped client types it as an array.
                const meeting = Array.isArray(t.meetings) ? t.meetings[0] : t.meetings;
                return (
                  <li key={t.id}>
                    <Link
                      href={`/faculty/transcript-view?m=${t.meeting_id}`}
                      className="group flex items-center justify-between gap-sm p-md transition-colors duration-150 hover:bg-surface-container-low"
                    >
                      <span className="min-w-0">
                        <span className="block font-body-md font-semibold group-hover:text-primary">{meeting?.title ?? 'Untitled meeting'}</span>
                        <span className="block font-caption text-caption text-on-surface-variant">
                          {meeting?.starts_at ? fmtManilaDate(meeting.starts_at) : ''} · {t.language}
                        </span>
                      </span>
                      <Icon name="chevron_right" className="text-on-surface-variant" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </>
    );
  }

  const { data: transcript } = await supabase
    .from('transcripts')
    .select('id, segments, language, meetings(title)')
    .eq('meeting_id', meetingId)
    // A meeting can be recorded more than once; show the latest transcript.
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const meeting = transcript ? (Array.isArray(transcript.meetings) ? transcript.meetings[0] : transcript.meetings) : null;
  const segments = (transcript?.segments ?? []) as TranscriptSegment[];

  return (
    <>
      <header className="mb-lg flex flex-col gap-md md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap gap-md">
            <Link href="/faculty/transcript-view" className="inline-flex items-center gap-xs font-body-sm font-semibold text-primary hover:underline">
              <Icon name="arrow_back" size={18} /> All transcripts
            </Link>
            <Link href={`/faculty/my-meetings/${meetingId}`} className="inline-flex items-center gap-xs font-body-sm font-semibold text-primary hover:underline">
              <Icon name="event" size={18} /> Meeting details
            </Link>
          </div>
          <h1 className="mt-xs font-h1 text-h1">{meeting?.title ?? 'Transcript'}</h1>
        </div>
        {transcript ? <AskAssistantButton /> : null}
      </header>

      {!transcript ? (
        <p className="text-on-surface-variant">No transcript found for this meeting, or you don&apos;t have access to it.</p>
      ) : segments.length === 0 ? (
        <p className="text-on-surface-variant">The transcript is empty.</p>
      ) : (
        <TranscriptViewer title={meeting?.title ?? 'Transcript'} segments={segments} language={transcript.language} />
      )}
    </>
  );
}
