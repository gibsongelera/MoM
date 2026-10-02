'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { Avatar } from '@/components/Avatar';
import { AudioPlayer } from '@/components/AudioPlayer';
import { useData } from '@/components/DataProvider';
import { saveTranscript, updateTranscriptComments, deleteTranscript, updateMeetingFields, notifyUser, logAudit } from '@/lib/db';
import { translateSegments } from '@/lib/translator';
import { summarizeSegments, extractActionItems } from '@/lib/summarizer';
import { fmtDate, fmtTime, uid } from '@/lib/utils';
import type { Comment, TranscriptSegment } from '@/lib/types';

function Inner() {
  const { user, ready } = useRequireRole('secretary');
  usePageTitle('Transcript Editor');
  const toast = useToast();
  const params = useSearchParams();
  const { transcripts, meetings, users, ready: dataReady, refresh } = useData();

  const initialId = useMemo(() => {
    const tid = params.get('t');
    const mid = params.get('m');
    if (tid) return transcripts.find((t) => t.id === tid)?.id;
    if (mid) return transcripts.find((t) => t.meetingId === mid)?.id;
    return transcripts[0]?.id;
  }, [params, transcripts]);

  const [activeId, setActiveId] = useState('');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [summary, setSummary] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [translated, setTranslated] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);

  const resolvedId = activeId || initialId || '';

  useEffect(() => {
    const t = resolvedId ? transcripts.find((x) => x.id === resolvedId) : null;
    if (t) {
      setSegments(JSON.parse(JSON.stringify(t.segments)));
      setSummary(t.summary || '');
      setComments(t.comments || []);
      setTranslated(false);
    }
  }, [resolvedId, dataReady]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || !user || !dataReady) return null;

  const current = resolvedId ? transcripts.find((t) => t.id === resolvedId) : null;
  const meeting = current ? meetings.find((m) => m.id === current.meetingId) : null;
  const isTL = current?.language === 'tl-PH';
  const dir = isTL ? 'tl-en' : 'en-tl';
  const display = translated ? translateSegments(segments, dir) : segments;
  const actions = extractActionItems(segments);

  function updateSpeaker(i: number, v: string) {
    setSegments((prev) => prev.map((s, idx) => (idx === i ? { ...s, speaker: v } : s)));
  }
  function updateText(i: number, v: string) {
    setSegments((prev) => prev.map((s, idx) => (idx === i ? { ...s, text: v } : s)));
  }
  // Map a diarized label (e.g. "Speaker 1") to a real participant across ALL
  // its segments at once (rec #11). Save Changes persists it.
  function remapSpeaker(oldName: string, newName: string) {
    if (!newName || newName === oldName) return;
    const uid2 = users.find((u) => u.name === newName)?.id;
    setSegments((prev) => prev.map((s) => (s.speaker === oldName ? { ...s, speaker: newName, speakerId: uid2 || s.speakerId } : s)));
  }

  async function save() {
    if (!current) return;
    try {
      await saveTranscript({
        meetingId: current.meetingId,
        segments,
        summary,
        language: current.language,
        confidence: current.confidence,
        keyDecisions: current.keyDecisions,
      });
    } catch {
      return toast('Could not save transcript', 'error');
    }
    void logAudit('transcript_edited', current.id);
    toast('Transcript saved', 'success');
    await refresh();
  }
  function regenerate() {
    const s = summarizeSegments(segments, 4);
    setSummary(s);
    toast('Summary regenerated with AI', 'ai');
  }
  async function del() {
    if (!current || !meeting) return;
    if (!window.confirm('Delete this transcript? The meeting reverts to un-processed.')) return;
    try {
      await deleteTranscript(current.id);
      await updateMeetingFields(meeting.id, { aiProcessed: false, status: 'scheduled' });
    } catch {
      return toast('Could not delete transcript', 'error');
    }
    void logAudit('transcript_deleted', current.id);
    toast('Transcript deleted', 'success');
    setActiveId('');
    await refresh();
  }
  function exportTxt() {
    if (!current) return;
    const text = segments.map((s) => `[${fmtTime(s.t)}] ${s.speaker}: ${s.text}`).join('\n\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text + (summary ? `\n\n=== SUMMARY ===\n${summary}` : '')], { type: 'text/plain' }));
    a.download = `transcript-${current.id}.txt`;
    a.click();
  }
  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!current || !commentText.trim()) return;
    const c: Comment = { id: uid('c'), ts: Date.now(), userId: user!.id, name: user!.name, text: commentText.trim(), parentId: replyTo?.id };
    const next = [...comments, c];
    setComments(next);
    try {
      await updateTranscriptComments(current.id, next);
    } catch {
      return toast('Could not post comment', 'error');
    }
    void logAudit('comment_posted', `Transcript comment by ${user!.name} on ${current.id}`);
    (meeting?.participantIds || []).forEach((pid) => {
      if (pid !== user!.id) void notifyUser(pid, 'task', 'New comment on transcript', `${user!.name}: ${commentText.trim().slice(0, 80)}`);
    });
    setCommentText('');
    setReplyTo(null);
    toast('Comment posted.', 'success');
    await refresh();
  }

  function renderComment(c: Comment, isReply: boolean) {
    const u = users.find((x) => x.id === c.userId);
    const replies = comments.filter((r) => r.parentId === c.id);
    return (
      <div key={c.id} className={`comment ${isReply ? 'reply' : ''}`}>
        <div className="flex gap-sm">
          <Avatar user={u || { name: c.name }} size="w-8 h-8 text-[11px]" />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-sm">
              <p className="font-body-sm font-semibold truncate">{c.name}</p>
              <p className="font-caption text-caption text-on-surface-variant">{fmtDate(c.ts, true)}</p>
            </div>
            <p className="font-body-sm whitespace-pre-wrap">{c.text}</p>
            <button type="button" className="text-primary font-label-caps text-label-caps mt-xs" onClick={() => setReplyTo({ id: c.id, name: c.name })}>
              Reply
            </button>
          </div>
        </div>
        {replies.map((r) => renderComment(r, true))}
      </div>
    );
  }

  const roots = comments.filter((c) => !c.parentId);

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="flex items-center justify-between flex-wrap gap-md mb-md">
        <div>
          <h1 className="font-h1 text-h1">Transcript Editor</h1>
          <p className="font-body-md text-on-surface-variant">
            {meeting ? `${meeting.title} · ${fmtDate(meeting.date, true)}` : current ? `Ad-hoc transcript` : '—'}
          </p>
        </div>
        <div className="flex gap-sm flex-wrap">
          <select value={resolvedId} onChange={(e) => setActiveId(e.target.value)} className="bg-surface-container border-transparent focus:border-primary rounded-lg py-sm px-md">
            {transcripts.length === 0 ? (
              <option value="">No transcripts available</option>
            ) : (
              transcripts.map((t) => {
                const m = meetings.find((mm) => mm.id === t.meetingId);
                return (
                  <option key={t.id} value={t.id}>
                    {m ? m.title : 'Ad-hoc transcript'} ({t.language})
                  </option>
                );
              })
            )}
          </select>
          <button onClick={() => { if (current) { setTranslated((v) => !v); if (!translated) { void logAudit('transcript_translated', `${current.id} - ${dir}`); toast(`Translated to ${dir === 'en-tl' ? 'Tagalog' : 'English'}`, 'ai'); } } }} className="bg-tertiary-container/20 border border-tertiary-container/30 text-tertiary-container px-md py-sm rounded-lg flex items-center gap-xs font-semibold">
            <span className="material-symbols-outlined text-[18px]">translate</span>
            <span>{translated ? 'Show Original' : isTL ? 'Translate to English' : 'Translate to Tagalog'}</span>
          </button>
          <button onClick={save} className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">save</span> Save Changes
          </button>
          {current ? (
            <button onClick={del} title="Delete transcript" className="border border-error text-error px-md py-sm rounded-lg hover:bg-error/10 flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-12 gap-md">
        <section className="col-span-12 lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex items-center justify-between mb-md pb-sm border-b border-outline-variant">
            <h3 className="font-h3 text-h3 flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary">closed_caption</span> Transcript
            </h3>
            <span className="pill pill-ai">{translated ? (isTL ? 'EN' : 'TL') : isTL ? 'TL' : 'EN'}</span>
          </div>
          <div className="space-y-md max-h-[600px] overflow-y-auto pr-sm">
            {display.length === 0 ? (
              <p className="text-center text-on-surface-variant py-xl">No transcripts yet. Record a meeting or upload audio to generate one.</p>
            ) : (
              display.map((s, i) => {
                const hi = s.speaker?.includes('Gomez') || s.speaker?.includes('Live');
                return (
                  <div key={i} className={`border-l-2 pl-md py-sm ${hi ? 'border-primary bg-primary/5 rounded-r-lg' : 'border-outline-variant'}`}>
                    <div className="flex items-center gap-sm mb-xs">
                      <input
                        className={`font-label-caps text-label-caps bg-transparent border-0 focus:bg-surface-container-low focus:ring-1 focus:ring-primary rounded font-semibold w-auto ${hi ? 'text-primary' : 'text-on-surface-variant'}`}
                        value={s.speaker || '—'}
                        readOnly={translated}
                        onChange={(e) => updateSpeaker(i, e.target.value)}
                      />
                      <span className="font-caption text-caption text-on-surface-variant">{fmtTime(s.t)}</span>
                      {s.confidence ? <span className="font-caption text-caption text-on-surface-variant ml-auto">{Math.round((s.confidence || 0) * 100)}%</span> : null}
                    </div>
                    <textarea
                      className="w-full bg-transparent border-0 focus:bg-surface-container-low focus:ring-1 focus:ring-primary rounded p-sm font-body-md text-on-surface"
                      rows={2}
                      readOnly={translated}
                      value={s.text}
                      onChange={(e) => updateText(i, e.target.value)}
                    />
                  </div>
                );
              })
            )}
          </div>
        </section>

        <aside className="col-span-12 lg:col-span-4 space-y-md">
          <AudioPlayer meetingId={meeting?.id} />

          {/* Speaker → participant mapping (rec #11) */}
          {(() => {
            const distinct = [...new Set(segments.map((s) => s.speaker).filter(Boolean))] as string[];
            const options = (meeting?.participantIds || []).map((id) => users.find((u) => u.id === id)?.name).filter(Boolean) as string[];
            const optionPool = options.length ? options : users.map((u) => u.name);
            if (distinct.length === 0) return null;
            return (
              <details className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
                <summary className="cursor-pointer font-h3 text-h3 flex items-center gap-sm">
                  <span className="material-symbols-outlined text-primary">record_voice_over</span> Map Speakers
                  <span className="font-caption text-caption text-on-surface-variant">({distinct.length})</span>
                </summary>
                <p className="font-caption text-caption text-on-surface-variant mt-sm mb-sm">
                  Assign each detected speaker to a participant — applied to every line at once, then Save Changes.
                </p>
                <div className="space-y-sm">
                  {distinct.map((sp) => (
                    <div key={sp} className="flex items-center gap-sm">
                      <span className="font-body-sm truncate flex-1" title={sp}>{sp}</span>
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">arrow_forward</span>
                      <select
                        defaultValue=""
                        onChange={(e) => { remapSpeaker(sp, e.target.value); e.target.value = ''; }}
                        className="bg-surface-container border-transparent focus:border-primary rounded-lg py-xs px-sm text-body-sm max-w-[52%]"
                        aria-label={`Map ${sp} to a participant`}
                      >
                        <option value="">Assign…</option>
                        {optionPool.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </details>
            );
          })()}

          <div className="glass-panel rounded-xl p-md">
            <h3 className="font-h3 text-h3 flex items-center gap-sm mb-md">
              <span className="material-symbols-outlined text-tertiary-container">auto_awesome</span> AI Summary
            </h3>
            <p className="font-body-md text-on-surface mb-md">{summary || '—'}</p>
            <button onClick={regenerate} className="w-full border border-tertiary-container/40 bg-tertiary-fixed text-on-tertiary-fixed-variant px-md py-sm rounded-lg hover:bg-tertiary-container/30 flex items-center justify-center gap-xs font-semibold">
              <span className="material-symbols-outlined text-[18px]">refresh</span> Regenerate
            </button>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
            <h3 className="font-h3 text-h3 flex items-center gap-sm mb-md">
              <span className="material-symbols-outlined text-primary">task_alt</span> Detected Action Items
            </h3>
            <div className="space-y-sm">
              {actions.length === 0 ? (
                <p className="font-body-sm text-on-surface-variant italic">No action items detected.</p>
              ) : (
                actions.slice(0, 5).map((a, i) => (
                  <div key={i} className="p-sm bg-tertiary-fixed/40 rounded-lg border-l-4 border-tertiary-container">
                    <p className="font-body-sm">{a.text.length > 120 ? a.text.slice(0, 117) + '...' : a.text}</p>
                    <div className="flex gap-sm mt-xs items-center flex-wrap">
                      {a.assignee ? <span className="font-caption text-caption text-on-surface-variant"><span className="material-symbols-outlined text-[12px]">person</span>{a.assignee}</span> : null}
                      {a.deadline ? <span className="font-caption text-caption text-on-surface-variant"><span className="material-symbols-outlined text-[12px]">schedule</span>{a.deadline}</span> : null}
                      <span className="font-caption text-caption text-tertiary-container ml-auto">{Math.round(a.confidence * 100)}%</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
            <h3 className="font-h3 text-h3 mb-md">Quick Actions</h3>
            <div className="space-y-xs">
              <Link href={meeting ? `/secretary/mom-editor?m=${meeting.id}` : '/secretary/mom-editor'} className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md text-center flex items-center justify-center gap-xs">
                <span className="material-symbols-outlined text-[18px]">description</span> Generate Document
              </Link>
              <button onClick={exportTxt} className="w-full border border-outline-variant px-md py-sm rounded-lg hover:bg-surface-container flex items-center justify-center gap-xs">
                <span className="material-symbols-outlined text-[18px]">file_download</span> Export as .txt
              </button>
            </div>
          </div>

          <div className="comments-panel bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
            <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary">forum</span> Comments
            </h3>
            <div className="space-y-sm mb-md max-h-[260px] overflow-y-auto pr-xs">
              {roots.length === 0 ? <p className="text-on-surface-variant italic font-body-sm">No comments yet. Be the first.</p> : roots.map((c) => renderComment(c, false))}
            </div>
            <form onSubmit={postComment} className="space-y-sm">
              <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} rows={2} placeholder="Add a comment for participants..." className="w-full px-md py-sm bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0 rounded-lg" required />
              <div className="flex items-center justify-between">
                <span className="font-caption text-caption text-on-surface-variant">{replyTo ? `Replying to ${replyTo.name}` : ''}</span>
                <button type="submit" className="px-md py-sm rounded-lg bg-primary text-on-primary shadow-primary-md font-label-caps text-label-caps">Post</button>
              </div>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function SecretaryTranscript() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
