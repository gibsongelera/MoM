'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { KpiGrid, type Kpi } from '@/components/Kpi';
import { useData } from '@/components/DataProvider';
import { scopeMeetings, scopeTasks, scopeUsers } from '@/lib/scope';
import { fmtDate, initials } from '@/lib/utils';

export default function HeadDashboard() {
  const { user, ready } = useRequireRole('head');
  usePageTitle('Department Dashboard');
  const { meetings: allMeetings, tasks: allTasks, users, departments, ready: dataReady } = useData();

  const data = useMemo(() => {
    if (!user) return null;
    const meetings = scopeMeetings(user, allMeetings);
    const tasks = scopeTasks(user, allTasks);
    const team = scopeUsers(user, users);
    const dept = departments.find((d) => d.id === user.departmentId);
    return { meetings, tasks, team, dept };
  }, [user, allMeetings, allTasks, users, departments]);

  if (!ready || !user || !dataReady || !data) return null;
  const { meetings, tasks, team, dept } = data;
  const pending = meetings.filter((m) => m.status === 'pending_approval');

  const kpis: Kpi[] = [
    { l: 'Department Meetings', v: meetings.length, i: 'event', tone: 'primary' },
    { l: 'Pending Approvals', v: pending.length, i: 'pending_actions', tone: 'tertiary' },
    { l: 'Active Tasks', v: tasks.filter((t) => t.status !== 'done').length, i: 'task_alt', tone: 'primary' },
    { l: 'Team Members', v: team.length, i: 'groups', tone: 'tertiary' },
  ];

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-md mb-lg">
        <div>
          <h1 className="font-h1 text-h1">Welcome, {user.name.split(' ').slice(0, 2).join(' ')}.</h1>
          <p className="font-body-lg text-on-surface-variant">{dept ? `${dept.name} (${dept.short})` : '—'}</p>
        </div>
        <div className="flex gap-sm flex-wrap">
          <Link
            href="/head/approvals"
            className="bg-tertiary-container/20 border border-tertiary-container/30 text-tertiary-container px-md py-sm rounded-lg flex items-center gap-xs font-semibold"
          >
            <span className="material-symbols-outlined text-[18px]">fact_check</span> Review Approvals
          </Link>
          <Link
            href="/head/delegate"
            className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md flex items-center gap-xs"
          >
            <span className="material-symbols-outlined text-[18px]">view_kanban</span> Delegate Tasks
          </Link>
        </div>
      </header>

      <KpiGrid kpis={kpis} />

      <div className="grid grid-cols-12 gap-md mb-lg">
        <section className="col-span-12 lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
          <div className="p-md border-b border-outline-variant flex justify-between items-center">
            <h3 className="font-h3 text-h3 flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary">pending_actions</span> Awaiting My Signature
            </h3>
            <Link href="/head/approvals" className="text-primary hover:underline font-label-caps text-label-caps">
              VIEW ALL
            </Link>
          </div>
          <div className="divide-y divide-outline-variant">
            {pending.length === 0 ? (
              <div className="p-md text-on-surface-variant text-center">No documents awaiting your signature.</div>
            ) : (
              pending.map((m) => (
                <div key={m.id} className="p-md flex items-center justify-between hover:bg-surface-container-low transition-colors">
                  <div className="flex items-center gap-md">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <span className="material-symbols-outlined">description</span>
                    </div>
                    <div>
                      <p className="font-body-md font-semibold">{m.title}</p>
                      <p className="font-caption text-caption text-on-surface-variant">
                        {fmtDate(m.date)} · MoM ready for approval
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/head/approvals?m=${m.id}`}
                    className="bg-primary text-on-primary px-md py-xs rounded-lg shadow-primary-md flex items-center gap-xs font-semibold"
                  >
                    <span className="material-symbols-outlined text-[16px]">draw</span> Review
                  </Link>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="col-span-12 lg:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary">groups</span> My Team
          </h3>
          <div className="space-y-sm">
            {team.slice(0, 6).map((u) => (
              <div key={u.id} className="flex items-center gap-sm p-sm rounded-lg hover:bg-surface-container-low transition-colors">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                  {initials(u.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body-sm font-semibold truncate">{u.name}</p>
                  <p className="font-caption text-caption text-on-surface-variant truncate">{u.position || u.role}</p>
                </div>
                <span className={`material-symbols-outlined text-[18px] ${u.active !== false ? 'text-success' : 'text-on-surface-variant'}`}>
                  {u.active !== false ? 'circle' : 'block'}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
        <div className="p-md border-b border-outline-variant flex justify-between items-center">
          <h3 className="font-h3 text-h3">Upcoming &amp; Recent Meetings</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Meeting</th>
                <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Date</th>
                <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Status</th>
                <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {meetings.slice(0, 8).map((m) => {
                const pillCls =
                  m.status === 'approved' ? 'pill-done' : m.status === 'pending_approval' ? 'pill-progress' : 'pill-pending';
                return (
                  <tr key={m.id} className="border-b border-outline-variant hover:bg-surface-container-low">
                    <td className="py-sm px-md font-semibold">{m.title}</td>
                    <td className="py-sm px-md text-on-surface-variant">{fmtDate(m.date, true)}</td>
                    <td className="py-sm px-md">
                      <span className={`pill ${pillCls}`}>{m.status.replace('_', ' ')}</span>
                    </td>
                    <td className="py-sm px-md text-right">
                      <Link href={`/head/approvals?m=${m.id}`} className="text-primary hover:underline font-semibold">
                        Open
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
