'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useData } from '@/components/DataProvider';
import { scopeMeetings } from '@/lib/scope';
import { fmtDate, fmtTime } from '@/lib/utils';

interface QueueItem {
  durationSec: number;
  queuedAt: number;
}

export default function SecretaryDashboard() {
  const { user, ready } = useRequireRole('secretary');
  usePageTitle('Secretary Dashboard');
  const { meetings: allMeetings, departments, ready: dataReady } = useData();

  const data = useMemo(() => {
    if (!user) return null;
    const meetings = scopeMeetings(user, allMeetings);
    const dept = departments.find((d) => d.id === user.departmentId);
    // Offline capture queue is a browser-only concept; nothing pending server-side.
    const queue: QueueItem[] = [];
    return { meetings, dept, queue };
  }, [user, allMeetings, departments]);

  if (!ready || !user || !dataReady || !data) return null;
  const { meetings, dept, queue } = data;

  const kpis = [
    { l: 'My Meetings', v: meetings.length, i: 'event', tone: 'primary' as const },
    { l: 'Pending Transcript', v: meetings.filter((m) => !m.aiProcessed).length, i: 'closed_caption', tone: 'tertiary' as const },
    { l: 'MoMs in Draft', v: meetings.filter((m) => m.status === 'transcribed').length, i: 'description', tone: 'primary' as const },
    { l: 'Awaiting Approval', v: meetings.filter((m) => m.status === 'pending_approval').length, i: 'pending_actions', tone: 'tertiary' as const },
  ];

  const workflow = [
    { href: '/secretary/schedule', icon: 'event', tone: 'text-primary', title: 'Schedule', sub: 'Create & manage meetings' },
    { href: '/secretary/live-recording', icon: 'mic', tone: 'text-primary', title: 'Record', sub: 'Live or offline capture' },
    { href: '/secretary/transcript', icon: 'closed_caption', tone: 'text-tertiary-container', title: 'Transcripts', sub: 'Edit & translate' },
    { href: '/secretary/mom-editor', icon: 'description', tone: 'text-primary', title: 'CHED MoM', sub: 'Format minutes' },
  ];

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-md mb-lg">
        <div>
          <h1 className="font-h1 text-h1">Hello, {user.name.split(' ')[0]}.</h1>
          <p className="font-body-md text-on-surface-variant">
            {dept ? `${dept.name} (${dept.short})` : ''}
          </p>
        </div>
        <div className="flex gap-sm flex-wrap">
          <Link
            href="/secretary/upload-audio"
            className="border border-outline-variant px-md py-sm rounded-lg hover:bg-surface-container flex items-center gap-xs"
          >
            <span className="material-symbols-outlined text-[18px]">upload_file</span> Upload Audio
          </Link>
          <Link
            href="/secretary/live-recording"
            className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md flex items-center gap-xs"
          >
            <span className="material-symbols-outlined text-[18px]">mic</span> Start Live Recording
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-md mb-lg">
        {kpis.map((k) => (
          <div
            key={k.l}
            className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md relative overflow-hidden"
          >
            <div
              className={`absolute top-0 right-0 w-1 h-full ${k.tone === 'primary' ? 'bg-primary' : 'bg-tertiary-container'}`}
            />
            <div className="flex items-center justify-between mb-sm">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">{k.l}</span>
              <span
                className={`material-symbols-outlined ${k.tone === 'primary' ? 'text-primary' : 'text-tertiary-container'}`}
              >
                {k.i}
              </span>
            </div>
            <p className="font-display text-[36px] font-bold leading-none">{k.v}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-md">
        <section className="col-span-12 lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-h3 text-h3 mb-md">My Workflow</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
            {workflow.map((w) => (
              <Link
                key={w.href}
                href={w.href}
                className="bg-surface-container-low rounded-lg p-md hover:shadow-primary-md transition-all border border-outline-variant"
              >
                <span className={`material-symbols-outlined ${w.tone} text-[28px]`}>{w.icon}</span>
                <p className="font-body-md font-semibold mt-sm">{w.title}</p>
                <p className="font-caption text-caption text-on-surface-variant mt-xs">{w.sub}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="col-span-12 lg:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm">
            <span className="material-symbols-outlined text-tertiary-container">cloud_sync</span> Offline Queue
          </h3>
          <div className="space-y-sm">
            {queue.length === 0 ? (
              <div className="text-center py-md text-on-surface-variant">
                <span className="material-symbols-outlined text-success text-[36px]">check_circle</span>
                <p className="font-body-sm mt-xs">All recordings synced.</p>
              </div>
            ) : (
              queue.map((q, idx) => (
                <div key={idx} className="p-sm bg-tertiary-fixed/40 border-l-4 border-tertiary-container rounded-lg">
                  <p className="font-body-sm font-semibold">Audio recording ({fmtTime(q.durationSec)})</p>
                  <p className="font-caption text-caption text-on-surface-variant">
                    Queued {fmtDate(q.queuedAt, true)} · waiting for sync
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden mt-md">
        <div className="p-md border-b border-outline-variant flex items-center justify-between">
          <h3 className="font-h3 text-h3">Recent Department Meetings</h3>
          <Link href="/secretary/archives" className="text-primary hover:underline font-label-caps text-label-caps">
            VIEW ARCHIVES
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Meeting</th>
                <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Date</th>
                <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Status</th>
                <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {meetings.slice(0, 8).map((m) => {
                const pillCls =
                  m.status === 'approved'
                    ? 'pill-done'
                    : m.status === 'pending_approval'
                      ? 'pill-progress'
                      : 'pill-pending';
                return (
                  <tr key={m.id} className="border-b border-outline-variant hover:bg-surface-container-low">
                    <td className="py-sm px-md font-semibold">{m.title}</td>
                    <td className="py-sm px-md text-on-surface-variant">{fmtDate(m.date, true)}</td>
                    <td className="py-sm px-md">
                      <span className={`pill ${pillCls}`}>{m.status.replace('_', ' ')}</span>
                    </td>
                    <td className="py-sm px-md text-right">
                      <Link
                        href={`/secretary/transcript?m=${m.id}`}
                        className="text-primary hover:underline font-semibold mr-md"
                      >
                        Transcript
                      </Link>
                      <Link
                        href={`/secretary/mom-editor?m=${m.id}`}
                        className="text-primary hover:underline font-semibold"
                      >
                        MoM
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
