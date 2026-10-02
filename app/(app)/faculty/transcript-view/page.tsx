'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { Avatar } from '@/components/Avatar';
import { AudioPlayer } from '@/components/AudioPlayer';
import { useData } from '@/components/DataProvider';
import { scopeMeetings } from '@/lib/scope';
import { translateSegments } from '@/lib/translator';
import { fmtDate, fmtTime } from '@/lib/utils';
import type { Comment, TranscriptSegment } from '@/lib/types';

function Inner() {
  const { user, ready } = useRequireRole('faculty');
  usePageTitle('Transcript Viewer');
  const toast = useToast();
  const params = useSearchParams();
  const { meetings: allMeetings, transcripts, tasks: allTasks, users, ready: dataReady } = useData();

  const meetings = useMemo(
    () => (user ? scopeMeetings(user, allMeetings) : []),
    [user, allMeetings],
  );

  const available = meetings.filter((m) => m.aiProcessed);
  const [activeId, setActiveId] = useState(() => params.get('m') || '');

  const [translated, setTranslated] = useState(false);

  if (!ready || !user || !dataReady) return null;

  const effectiveId = activeId || available[0]?.id || '';
  const m = meetings.find((x) => x.id === effectiveId);
  const t = transcripts.find((x) => x.meetingId === effectiveId);
  const isTL = t?.language === 'tl-PH';
  const dir = isTL ? 'tl-en' : 'en-tl';
  const segs: TranscriptSegment[] = t ? (translated ? translateSegments(t.segments, dir) : t.segments) : [];
  const myTasks = allTasks.filter((x) => x.meetingId === effectiveId && x.assigneeId === user.id);
  const isParticipant = !!m && (m.participantIds || []).includes(user.id);
  const comments = t?.comments || [];
  const roots = comments.filter((c) => !c.parentId);

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
          </div>
        </div>
        {replies.map((r) => renderComment(r, true))}
      </div>
    );
  }

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="flex items-center justify-between flex-wrap gap-md mb-md">
        <div>
          <Link href="/faculty/my-meetings" className="inline-flex items-center gap-xs text-on-surface-variant hover:text-primary mb-xs font-body-sm">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span> Back to my meetings
          </Link>
          <h1 className="font-h1 text-h1">{m ? m.title : 'Transcript'}</h1>
          <p className="font-body-md text-on-surface-variant">{m ? `${fmtDate(m.date, true)} · ${m.venue || '—'}` : '—'}</p>
        </div>
        <div className="flex gap-sm">
          <select value={effectiveId} onChange={(e) => { setActiveId(e.target.value); setTranslated(false); }} className="bg-surface-container border-transparent focus:border-primary rounded-lg py-sm px-md">
            {available.length === 0 ? (
              <option>No transcripts</option>
            ) : (
              available.map((mm) => (
                <option key={mm.id} value={mm.id}>
                  {mm.title}
                </option>
              ))
            )}
          </select>
          <button
            onClick={() => {
              if (!t) return;
              setTranslated((v) => !v);
              if (!translated) toast('Translated', 'ai');
            }}
            className="bg-tertiary-container/20 border border-tertiary-container/30 text-tertiary-container px-md py-sm rounded-lg flex items-center gap-xs font-semibold"
          >
            <span className="material-symbols-outlined text-[18px]">translate</span>
            <span>{translated ? 'Show Original' : isTL ? 'Translate to English' : 'Translate to Tagalog'}</span>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-md">
        <section className="col-span-12 lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <div className="flex items-center justify-between pb-sm border-b border-outline-variant mb-md">
            <h3 className="font-h3 text-h3 flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary">closed_caption</span> Transcript (read-only)
            </h3>
            <span className="pill pill-ai">{translated ? (isTL ? 'EN' : 'TL') : isTL ? 'TL' : 'EN'}</span>
          </div>
          <div className="space-y-md max-h-[600px] overflow-y-auto pr-sm">
            {segs.length === 0 ? (
              <p className="text-on-surface-variant py-xl text-center">No transcript available for this meeting.</p>
            ) : (
              segs.map((s, i) => {
                const isChair = s.speaker?.includes('Gomez');
                return (
                  <div key={i} className={`border-l-2 pl-md py-xs ${isChair ? 'border-primary bg-primary/5 rounded-r-lg' : 'border-outline-variant'}`}>
                    <div className={`font-label-caps text-label-caps mb-xs ${isChair ? 'text-primary' : 'text-on-surface-variant'}`}>
                      {s.speaker || ''} · {fmtTime(s.t)}
                    </div>
                    <p className="font-body-md text-on-surface">{s.text}</p>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <aside className="col-span-12 lg:col-span-4 space-y-md">
          <AudioPlayer meetingId={m?.id} />
          <div className="glass-panel rounded-xl p-md">
            <h3 className="font-h3 text-h3 flex items-center gap-sm mb-md">
              <span className="material-symbols-outlined text-tertiary-container">auto_awesome</span> AI Summary
            </h3>
            <p className="font-body-md">{t?.summary || '—'}</p>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
            <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary">task_alt</span> Tasks Assigned to Me
            </h3>
            <div className="space-y-sm">
              {myTasks.length === 0 ? (
                <p className="font-body-sm text-on-surface-variant italic">No tasks assigned to you from this meeting.</p>
              ) : (
                myTasks.map((tk) => (
                  <Link key={tk.id} href={`/faculty/my-tasks?t=${tk.id}`} className="block p-sm bg-surface-container-low rounded-lg border border-outline-variant hover:border-primary transition-colors">
                    <p className="font-body-sm font-semibold">{tk.title}</p>
                    <div className="flex gap-xs mt-xs items-center">
                      <span className={`pill ${tk.status === 'done' ? 'pill-done' : tk.status === 'in_progress' ? 'pill-progress' : 'pill-pending'}`}>
                        {tk.status.replace('_', ' ')}
                      </span>
                      {tk.deadline ? <span className="font-caption text-caption text-on-surface-variant">{tk.deadline}</span> : null}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {isParticipant ? (
            <div className="comments-panel bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
              <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm">
                <span className="material-symbols-outlined text-primary">forum</span> Discussion
              </h3>
              <p className="font-caption text-caption text-on-surface-variant mb-sm">
                Read-only view of the secretary&apos;s discussion thread. Visible only to participants.
              </p>
              <div className="space-y-sm max-h-[260px] overflow-y-auto pr-xs">
                {roots.length === 0 ? (
                  <p className="text-on-surface-variant italic font-body-sm">No comments yet.</p>
                ) : (
                  roots.map((c) => renderComment(c, false))
                )}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

export default function FacultyTranscriptView() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
