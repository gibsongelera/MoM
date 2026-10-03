import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

interface TranscriptSegment {
  speakerId: string | null;
  speaker: string;
  t: number;
  text: string;
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default async function FacultyTranscriptViewPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m: meetingId } = await searchParams;
  const supabase = await createClient();

  if (!meetingId) {
    const { data: transcripts } = await supabase
      .from('transcripts')
      .select('id, meeting_id, language, created_at, meetings(title, starts_at)')
      .order('created_at', { ascending: false });

    return (
      <>
        <header className="mb-lg">
          <h1 className="font-h1 text-h1">Transcripts</h1>
          <p className="font-body-lg text-on-surface-variant">Read-only. Meetings you can see that have a completed transcript.</p>
        </header>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl divide-y divide-outline-variant">
          {(transcripts ?? []).length === 0 ? (
            <p className="p-md text-on-surface-variant">No transcripts available yet.</p>
          ) : (
            (transcripts ?? []).map((t) => {
              // meetings(...) is a single embedded row here (transcripts.meeting_id -> meetings.id, one FK) but
              // PostgREST types this as an array on the untyped client - narrow defensively.
              const meeting = Array.isArray(t.meetings) ? t.meetings[0] : t.meetings;
              return (
                <Link
                  key={t.id}
                  href={`/faculty/transcript-view?m=${t.meeting_id}`}
                  className="p-md flex items-center justify-between hover:bg-surface-container-low transition-colors"
                >
                  <div>
                    <p className="font-body-md font-semibold">{meeting?.title ?? 'Untitled meeting'}</p>
                    <p className="font-caption text-caption text-on-surface-variant">
                      {meeting?.starts_at
                        ? new Date(meeting.starts_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                        : ''}{' '}
                      · {t.language}
                    </p>
                  </div>
                  <span aria-hidden="true" translate="no" className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
                </Link>
              );
            })
          )}
        </div>
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
      <header className="mb-lg">
        <Link href="/faculty/transcript-view" className="text-primary hover:underline font-label-caps text-label-caps">
          &larr; All transcripts
        </Link>
        <h1 className="font-h1 text-h1 mt-xs">{meeting?.title ?? 'Transcript'}</h1>
      </header>

      {!transcript ? (
        <p className="text-on-surface-variant">No transcript found for this meeting, or you don&apos;t have access to it.</p>
      ) : (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md space-y-md">
          {segments.length === 0 ? (
            <p className="text-on-surface-variant">Transcript is empty.</p>
          ) : (
            segments.map((s, i) => (
              <div key={i} className="border-l-2 border-outline-variant pl-md py-xs">
                <div className="font-label-caps text-label-caps text-on-surface-variant mb-xs">
                  {s.speaker} · {fmtTime(s.t)}
                </div>
                <p className="font-body-sm text-on-surface">{s.text}</p>
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
