'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { KpiGrid, type Kpi } from '@/components/Kpi';
import { useData } from '@/components/DataProvider';
import { scopeMeetings, scopeTasks, scopePersonalMeetings } from '@/lib/scope';
import { fmtDate } from '@/lib/utils';

export default function FacultyDashboard() {
  const { user, ready } = useRequireRole('faculty');
  usePageTitle('My Dashboard');
  const {
    tasks: allTasks,
    meetings: allMeetings,
    departments,
    transcripts: allTranscripts,
    personalMeetings,
    notifications,
    ready: dataReady,
  } = useData();

  const data = useMemo(() => {
    if (!user) return null;
    const tasks = scopeTasks(user, allTasks);
    const meetings = scopeMeetings(user, allMeetings);
    const dept = departments.find((d) => d.id === user.departmentId);
    const transcripts = allTranscripts.filter((t) => meetings.some((m) => m.id === t.meetingId));
    const personal = scopePersonalMeetings(user, personalMeetings).sort(
      (a, b) =>
        new Date(`${b.date}T${b.time || '00:00'}`).getTime() -
        new Date(`${a.date}T${a.time || '00:00'}`).getTime(),
    );
    const notifs = notifications.filter((n) => n.userId === user.id || !n.userId);
    return { tasks, meetings, dept, transcripts, personal, notifs };
  }, [user, allTasks, allMeetings, departments, allTranscripts, personalMeetings, notifications]);

  if (!ready || !user || !dataReady || !data) return null;
  const { tasks, meetings, dept, transcripts, personal, notifs } = data;

  const kpis: Kpi[] = [
    { l: 'Open Tasks', v: tasks.filter((t) => t.status !== 'done').length, i: 'task_alt', tone: 'primary' },
    { l: 'Completed', v: tasks.filter((t) => t.status === 'done').length, i: 'check_circle', tone: 'tertiary' },
    { l: 'My Meetings', v: meetings.length, i: 'event', tone: 'primary' },
    { l: 'AI Transcripts', v: transcripts.length, i: 'closed_caption', tone: 'tertiary' },
  ];

  const open = tasks.filter((t) => t.status !== 'done').slice(0, 6);
  const now = Date.now();
  const upcoming = meetings
    .filter((m) => new Date(m.date).getTime() >= now - 86400000)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Hello, {user.name.split(' ').slice(0, 2).join(' ')}.</h1>
        <p className="font-body-md text-on-surface-variant">{dept ? `${dept.name} (${dept.short})` : ''}</p>
      </header>

      <KpiGrid kpis={kpis} />

      <div className="grid grid-cols-12 gap-md">
        <section className="col-span-12 lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
          <div className="p-md border-b border-outline-variant flex justify-between items-center">
            <h3 className="font-h3 text-h3 flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary">task_alt</span> My Active Tasks
            </h3>
            <Link href="/faculty/my-tasks" className="text-primary hover:underline font-label-caps text-label-caps">
              VIEW ALL
            </Link>
          </div>
          <div className="divide-y divide-outline-variant">
            {open.length === 0 ? (
              <p className="p-md text-on-surface-variant">All caught up! No active tasks.</p>
            ) : (
              open.map((t) => {
                const overdue = t.deadline && new Date(t.deadline) < new Date();
                return (
                  <div key={t.id} className="p-md flex items-center justify-between hover:bg-surface-container-low transition-colors">
                    <div className="flex items-start gap-md flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined">checklist</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-body-md font-semibold truncate">{t.title}</p>
                        <div className="flex gap-sm mt-xs items-center flex-wrap">
                          {t.aiExtracted ? <span className="pill pill-ai">AI Extracted</span> : null}
                          <span className={`pill ${t.status === 'in_progress' ? 'pill-progress' : 'pill-pending'}`}>
                            {t.status.replace('_', ' ')}
                          </span>
                          {t.deadline ? (
                            <span className={`font-caption text-caption ${overdue ? 'text-error font-semibold' : 'text-on-surface-variant'}`}>
                              <span className="material-symbols-outlined text-[12px]">schedule</span> {t.deadline}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <Link href={`/faculty/my-tasks?t=${t.id}`} className="text-primary hover:underline font-semibold ml-md">
                      Open
                    </Link>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="col-span-12 lg:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary">event_upcoming</span> Upcoming Meetings
          </h3>
          <div className="space-y-sm">
            {upcoming.length === 0 ? (
              <p className="text-on-surface-variant">No upcoming meetings.</p>
            ) : (
              upcoming.map((m) => (
                <div key={m.id} className="p-sm bg-surface-container-low rounded-lg border border-outline-variant flex items-center gap-sm">
                  <div className="w-9 h-9 rounded-lg bg-primary text-on-primary flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px]">event</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body-sm font-semibold truncate">{m.title}</p>
                    <p className="font-caption text-caption text-on-surface-variant">
                      {fmtDate(m.date, true)} · {m.venue || 'TBA'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md mt-md">
        <div className="flex items-center justify-between mb-md">
          <h3 className="font-h3 text-h3 flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary">event_available</span> Personal Meeting Log
          </h3>
          <div className="flex gap-sm">
            <Link href="/faculty/personal-meetings" className="text-primary hover:underline font-label-caps text-label-caps">
              VIEW ALL
            </Link>
            <Link
              href="/faculty/personal-meetings"
              className="bg-primary text-on-primary rounded-lg px-sm py-xs font-label-caps text-label-caps shadow-primary-md flex items-center gap-xs"
            >
              <span className="material-symbols-outlined text-[14px]">add</span> LOG
            </Link>
          </div>
        </div>
        <div className="space-y-sm">
          {personal.length === 0 ? (
            <p className="text-on-surface-variant text-body-sm italic">
              No personal meetings logged yet. Use the Personal Meetings page to track your one-on-ones and advising
              sessions.
            </p>
          ) : (
            personal.slice(0, 4).map((p) => (
              <Link
                key={p.id}
                href={`/faculty/personal-meetings?id=${p.id}`}
                className="block p-sm bg-surface-container-low rounded-lg border border-outline-variant hover:border-primary transition-colors"
              >
                <div className="flex items-baseline gap-sm">
                  <p className="font-body-sm font-semibold flex-1 truncate">{p.title}</p>
                  <span className="pill pill-regular">{p.type || 'Personal'}</span>
                </div>
                <p className="font-caption text-caption text-on-surface-variant">
                  {p.date}
                  {p.time ? ` · ${p.time}` : ''}
                  {p.attendees ? ` · ${p.attendees}` : ''}
                </p>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md mt-md">
        <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm">
          <span className="material-symbols-outlined text-tertiary-container">notifications_active</span> Recent
          Notifications
        </h3>
        <div className="space-y-sm">
          {notifs.length === 0 ? (
            <p className="text-on-surface-variant">No notifications.</p>
          ) : (
            notifs.slice(0, 5).map((n) => {
              const icon =
                n.type === 'ai' ? 'auto_awesome' : n.type === 'approval' ? 'fact_check' : n.type === 'task' ? 'task_alt' : 'info';
              const iconColor =
                n.type === 'ai' ? 'text-tertiary-container' : n.type === 'approval' ? 'text-primary' : 'text-on-surface-variant';
              return (
                <div
                  key={n.id}
                  className={`p-sm rounded-lg flex items-start gap-sm ${n.read ? 'bg-surface-container-low' : 'bg-tertiary-fixed/30 border-l-4 border-tertiary-container'}`}
                >
                  <span className={`material-symbols-outlined mt-xs ${iconColor}`}>{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-body-sm font-semibold">{n.title}</p>
                    <p className="font-caption text-caption text-on-surface-variant">
                      {n.body} · {fmtDate(n.ts, true)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
