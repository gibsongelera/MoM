import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import TranscriptEditor from '@/components/dashboard/TranscriptEditor';

interface TranscriptSegment {
  speakerId: string | null;
  speaker: string;
  t: number;
  text: string;
}

export default async function SecretaryTranscriptPage({
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
          <p className="font-body-lg text-on-surface-variant">Edit speaker names and leave comments for participants.</p>
        </header>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl divide-y divide-outline-variant">
          {(transcripts ?? []).length === 0 ? (
            <p className="p-md text-on-surface-variant">
              No transcripts yet. Upload audio from <Link href="/secretary/upload-audio" className="text-primary hover:underline">Upload Audio</Link> first.
            </p>
          ) : (
            (transcripts ?? []).map((t) => {
              const meeting = Array.isArray(t.meetings) ? t.meetings[0] : t.meetings;
              return (
                <Link key={t.id} href={`/secretary/transcript?m=${t.meeting_id}`} className="p-md flex items-center justify-between hover:bg-surface-container-low transition-colors">
                  <div>
                    <p className="font-body-md font-semibold">{meeting?.title ?? 'Untitled meeting'}</p>
                    <p className="font-caption text-caption text-on-surface-variant">
                      {meeting?.starts_at ? new Date(meeting.starts_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : ''} ·{' '}
                      {t.language}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
                </Link>
              );
            })
          )}
        </div>
      </>
    );
  }

  // A meeting can be recorded more than once; edit the latest transcript.
  const { data: transcript } = await supabase
    .from('transcripts')
    .select('id, segments, language, meetings(title)')
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: speakerRows } = transcript
    ? await supabase.from('transcript_speakers').select('transcript_id, speaker_label, display_name').eq('transcript_id', transcript.id)
    : { data: [] as { transcript_id: string; speaker_label: string; display_name: string }[] };

  const meeting = transcript ? (Array.isArray(transcript.meetings) ? transcript.meetings[0] : transcript.meetings) : null;
  const segments = (transcript?.segments ?? []) as TranscriptSegment[];
  const speakerNames = Object.fromEntries(
    (speakerRows ?? []).filter((r) => r.transcript_id === transcript?.id).map((r) => [r.speaker_label, r.display_name]),
  );

  let comments: { id: string; ts: number; userId: string | null; name: string; text: string }[] = [];
  if (transcript) {
    const { data: fullTranscript } = await supabase.from('transcripts').select('comments').eq('id', transcript.id).single();
    comments = (fullTranscript?.comments ?? []) as typeof comments;
  }

  return (
    <>
      <header className="mb-lg">
        <Link href="/secretary/transcript" className="text-primary hover:underline font-label-caps text-label-caps">
          &larr; All transcripts
        </Link>
        <h1 className="font-h1 text-h1 mt-xs">{meeting?.title ?? 'Transcript'}</h1>
      </header>

      {!transcript ? (
        <p className="text-on-surface-variant">No transcript found for this meeting yet.</p>
      ) : (
        <TranscriptEditor transcriptId={transcript.id} segments={segments} speakerNames={speakerNames} comments={comments} />
      )}
    </>
  );
}
