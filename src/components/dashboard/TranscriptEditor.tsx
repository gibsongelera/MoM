'use client';

/** Speaker reassignment: diarization emits speaker_0/speaker_1..., this
 * lets a secretary map each to a real name once. Renaming writes to
 * transcript_speakers (upsert on the transcript_id+speaker_label primary
 * key) rather than rewriting transcripts.segments - segment display names
 * are resolved from this mapping at render time instead. */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface TranscriptSegment {
  speakerId: string | null;
  speaker: string;
  t: number;
  text: string;
}

interface Comment {
  id: string;
  ts: number;
  userId: string | null;
  name: string;
  text: string;
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function TranscriptEditor({
  transcriptId,
  segments,
  speakerNames: initialSpeakerNames,
  comments: initialComments,
}: {
  transcriptId: string;
  segments: TranscriptSegment[];
  speakerNames: Record<string, string>;
  comments: Comment[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [speakerNames, setSpeakerNames] = useState(initialSpeakerNames);
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [savingSpeaker, setSavingSpeaker] = useState(false);

  const [comments, setComments] = useState(initialComments);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const distinctSpeakers = [...new Set(segments.map((s) => s.speakerId).filter((id): id is string => id !== null))];

  function nameFor(speakerId: string | null, fallback: string): string {
    if (!speakerId) return fallback;
    return speakerNames[speakerId] ?? fallback;
  }

  async function saveSpeakerName(speakerId: string) {
    if (!draftName.trim()) return;
    setSavingSpeaker(true);
    setError(null);
    const { error: upsertError } = await supabase
      .from('transcript_speakers')
      .upsert(
        { transcript_id: transcriptId, speaker_label: speakerId, display_name: draftName.trim() },
        { onConflict: 'transcript_id,speaker_label' },
      );
    setSavingSpeaker(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setSpeakerNames((prev) => ({ ...prev, [speakerId]: draftName.trim() }));
    setEditingSpeaker(null);
    router.refresh();
  }

  async function postComment(e: FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setPostingComment(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('append_transcript_comment', {
      p_transcript_id: transcriptId,
      p_text: commentText.trim(),
    });
    setPostingComment(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setComments((data as Comment[] | null) ?? comments);
    setCommentText('');
  }

  return (
    <div className="grid grid-cols-12 gap-md">
      <div className="col-span-12 lg:col-span-8 space-y-md">
        {distinctSpeakers.length > 0 ? (
          <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
            <h3 className="font-h3 text-h3 mb-sm">Speakers</h3>
            <div className="flex flex-wrap gap-sm">
              {distinctSpeakers.map((id) => (
                <div key={id} className="flex items-center gap-xs bg-surface-container-low border border-outline-variant rounded-full pl-md pr-xs py-xs">
                  {editingSpeaker === id ? (
                    <>
                      <input
                        aria-label="Speaker name"
                        autoFocus
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveSpeakerName(id)}
                        className="w-32 rounded-md border-outline-variant bg-surface-container-lowest text-body-sm py-0"
                      />
                      <button type="button" aria-label="Save speaker name" onClick={() => saveSpeakerName(id)} disabled={savingSpeaker} className="flex h-8 w-8 items-center justify-center rounded-full text-primary hover:bg-primary/10">
                        <span aria-hidden="true" translate="no" className="material-symbols-outlined text-[18px]">check</span>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingSpeaker(id);
                        setDraftName(speakerNames[id] ?? '');
                      }}
                      className="font-body-sm font-semibold flex items-center gap-xs"
                    >
                      {nameFor(id, id)} <span aria-hidden="true" translate="no" className="material-symbols-outlined text-[14px] text-on-surface-variant">edit</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md space-y-md">
          {segments.length === 0 ? (
            <p className="text-on-surface-variant">Transcript is empty.</p>
          ) : (
            segments.map((s, i) => (
              <div key={i} className="border-l-2 border-outline-variant pl-md py-xs">
                <div className="font-label-caps text-label-caps text-on-surface-variant mb-xs">
                  {nameFor(s.speakerId, s.speaker)} · {fmtTime(s.t)}
                </div>
                <p className="font-body-sm text-on-surface">{s.text}</p>
              </div>
            ))
          )}
        </section>
      </div>

      <div className="col-span-12 lg:col-span-4">
        <section className="comments-panel bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-h3 text-h3 mb-sm">Comments</h3>
          <div className="space-y-sm mb-md max-h-[400px] overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-on-surface-variant font-body-sm">No comments yet.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="comment">
                  <p className="font-body-sm font-semibold">{c.name}</p>
                  <p className="font-body-sm">{c.text}</p>
                  <p className="font-caption text-caption text-on-surface-variant mt-xs">{new Date(c.ts).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
          <form onSubmit={postComment} className="flex gap-xs">
            <input
              aria-label="Add a comment"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment…"
              className="flex-1 rounded-lg border-outline-variant bg-surface-container font-body-sm"
            />
            <button type="submit" aria-label="Post comment" disabled={postingComment} className="bg-primary text-on-primary px-md rounded-lg shadow-primary-md disabled:opacity-60">
              <span aria-hidden="true" translate="no" className="material-symbols-outlined text-[18px]">send</span>
            </button>
          </form>
        </section>
        {error ? <p className="text-error font-body-sm mt-sm">{error}</p> : null}
      </div>
    </div>
  );
}