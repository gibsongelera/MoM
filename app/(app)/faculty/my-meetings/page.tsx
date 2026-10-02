'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { useData } from '@/components/DataProvider';
import { setMeetingRsvp, logAudit } from '@/lib/db';
import { scopeMeetings } from '@/lib/scope';
import { fmtDate } from '@/lib/utils';
import type { RsvpStatus } from '@/lib/types';

export default function FacultyMyMeetings() {
  const { user, ready } = useRequireRole('faculty');
  usePageTitle('My Meetings');
  const toast = useToast();
  const { meetings: allMeetings, transcripts, tasks, ready: dataReady, refresh } = useData();

  const meetings = useMemo(
    () => (user ? scopeMeetings(user, allMeetings) : []),
    [user, allMeetings],
  );

  if (!ready || !user || !dataReady) return null;

  async function rsvp(meetingId: string, status: RsvpStatus) {
    const m = meetings.find((x) => x.id === meetingId);
    if (!m) return;
    try {
      await setMeetingRsvp(meetingId, status);
    } catch {
      return toast('Could not record RSVP', 'error');
    }
    void logAudit('meeting_rsvp', `${user!.name} ${status} ${m.title}`);
    toast(`You ${status} the invitation.`, status === 'accepted' ? 'success' : 'info');
    await refresh();
  }

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">My Meetings</h1>
        <p className="font-body-md text-on-surface-variant">Meetings you&apos;ve been a participant in, with transcripts &amp; summaries.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        {meetings.length === 0 ? (
          <p className="col-span-full text-center text-on-surface-variant py-xl">You have no meetings yet.</p>
        ) : (
          meetings.map((m) => {
            const t = transcripts.find((x) => x.meetingId === m.id);
            const mTasks = tasks.filter((x) => x.meetingId === m.id && x.assigneeId === user.id);
            const pillCls = m.status === 'approved' ? 'pill-done' : m.status === 'pending_approval' ? 'pill-progress' : 'pill-pending';
            const myRsvp = m.rsvps?.[user.id];
            const upcoming = m.status === 'scheduled';
            return (
              <div key={m.id} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
                <div className="flex items-start justify-between mb-md">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <span className="material-symbols-outlined">groups</span>
                  </div>
                  <div className="flex flex-col items-end gap-xs">
                    <span className={`pill ${pillCls}`}>{m.status.replace('_', ' ')}</span>
                    {m.aiProcessed ? <span className="pill pill-ai">AI Processed</span> : null}
                  </div>
                </div>
                <h3 className="font-h3 text-h3 mb-xs">{m.title}</h3>
                <p className="font-caption text-caption text-on-surface-variant mb-sm">
                  {fmtDate(m.date, true)} · {m.venue || '—'}
                </p>
                {t?.summary ? (
                  <div className="bg-tertiary-fixed/30 border-l-4 border-tertiary-container rounded-r-lg p-sm mb-md">
                    <p className="font-body-sm flex items-center gap-xs mb-xs">
                      <span className="material-symbols-outlined text-[16px] text-tertiary-container">auto_awesome</span>
                      <strong>AI Summary</strong>
                    </p>
                    <p className="font-caption text-caption text-on-surface line-clamp-3">{t.summary}</p>
                  </div>
                ) : null}
                {mTasks.length ? (
                  <p className="font-body-sm mb-md flex items-center gap-xs">
                    <span className="material-symbols-outlined text-[16px] text-primary">task_alt</span>{' '}
                    <strong>{mTasks.length}</strong> task{mTasks.length > 1 ? 's' : ''} assigned to you
                  </p>
                ) : null}
                {upcoming ? (
                  <div className="mb-sm p-sm bg-surface-container-low rounded-lg border border-outline-variant">
                    {myRsvp ? (
                      <p className="font-body-sm flex items-center gap-xs">
                        <span className={`material-symbols-outlined text-[18px] ${myRsvp === 'accepted' ? 'text-success' : 'text-error'}`}>{myRsvp === 'accepted' ? 'event_available' : 'event_busy'}</span>
                        You {myRsvp} this invitation.
                        <button onClick={() => rsvp(m.id, myRsvp === 'accepted' ? 'declined' : 'accepted')} className="text-primary hover:underline font-label-caps text-label-caps ml-auto">Change</button>
                      </p>
                    ) : (
                      <div className="flex items-center gap-sm">
                        <span className="font-label-caps text-label-caps text-on-surface-variant flex-1">RSVP:</span>
                        <button onClick={() => rsvp(m.id, 'accepted')} className="bg-success/10 text-success border border-success/30 px-md py-xs rounded-lg font-label-caps text-label-caps flex items-center gap-xs">
                          <span className="material-symbols-outlined text-[16px]">check</span> Accept
                        </button>
                        <button onClick={() => rsvp(m.id, 'declined')} className="bg-error/10 text-error border border-error/30 px-md py-xs rounded-lg font-label-caps text-label-caps flex items-center gap-xs">
                          <span className="material-symbols-outlined text-[16px]">close</span> Decline
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
                <Link
                  href={`/faculty/transcript-view?m=${m.id}`}
                  className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md text-center hover:opacity-90 flex items-center justify-center gap-xs"
                >
                  <span className="material-symbols-outlined text-[18px]">closed_caption</span> View Transcript &amp; Summary
                </Link>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
