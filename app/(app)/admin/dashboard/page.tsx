'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { useData } from '@/components/DataProvider';
import { MeetingsPerMonth, TasksDoughnut, UsersByRole, AiAccuracyTrend } from '@/components/Charts';
import { logAudit } from '@/lib/db';
import { statsFor } from '@/lib/scope';
import { fmtDate, initials } from '@/lib/utils';

function auditIcon(action: string): [string, string] {
  if (action.includes('transcrib')) return ['auto_awesome', 'text-tertiary-container'];
  if (action.includes('approve') || action.includes('sign')) return ['check_circle', 'text-success'];
  if (action.includes('login') || action.includes('logout')) return ['login', 'text-primary'];
  if (action.includes('role') || action.includes('user')) return ['group_add', 'text-secondary'];
  if (action.includes('recording')) return ['mic', 'text-primary'];
  if (action.includes('task')) return ['task_alt', 'text-tertiary-container'];
  return ['info', 'text-on-surface-variant'];
}

export default function AdminDashboard() {
  const { user, ready } = useRequireRole('admin');
  usePageTitle('Admin Dashboard');
  const toast = useToast();
  const {
    departments,
    users: allUsers,
    meetings: allMeetings,
    tasks: allTasks,
    audit: auditAll,
    ready: dataReady,
  } = useData();

  const data = useMemo(() => {
    if (!user) return null;
    const s = statsFor(user, { meetings: allMeetings, tasks: allTasks, users: allUsers });
    const auditLog = auditAll.slice(0, 8);
    return { s, departments, allUsers, allMeetings, allTasks, auditLog };
  }, [user, departments, allUsers, allMeetings, allTasks, auditAll]);

  if (!ready || !user || !dataReady || !data) return null;
  const { s, auditLog } = data;

  const kpis = [
    { label: 'Active Users', value: s.activeUsers, sub: `${allUsers.length} total accounts`, icon: 'group', tone: 'primary' as const },
    { label: 'Meetings This Month', value: s.meetingsThisMonth, sub: `${s.totalMeetings} total`, icon: 'event', tone: 'tertiary' as const },
    { label: 'AI Hours Saved', value: `${s.aiHoursSaved}h`, sub: 'Last 30 days', icon: 'auto_awesome', tone: 'tertiary' as const },
    { label: 'Pending Approvals', value: s.pendingApprovals, sub: 'Minutes awaiting signature', icon: 'pending_actions', tone: 'primary' as const },
  ];

  function exportData() {
    const out = { departments, users: allUsers, meetings: allMeetings, tasks: allTasks, audit: auditAll };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartmin-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    void logAudit('data_export', 'Admin exported full backup');
    toast('Backup exported successfully', 'success');
  }

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-md mb-lg">
        <div>
          <h1 className="font-h1 text-h1 text-on-surface">Welcome back, {user.name.split(' ')[0]}.</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            High-level state of ZPPSU governance and AI processing.
          </p>
        </div>
        <div className="flex gap-sm flex-wrap">
          <button
            onClick={exportData}
            className="bg-surface-container hover:bg-surface-container-high border border-outline-variant text-on-surface px-md py-sm rounded-lg flex items-center gap-xs"
          >
            <span className="material-symbols-outlined text-[18px]">download</span> Export Backup
          </button>
          <Link
            href="/admin/settings"
            className="bg-tertiary-container/20 text-tertiary-container hover:bg-tertiary-container/30 border border-tertiary-container/30 px-md py-sm rounded-lg flex items-center gap-xs font-semibold"
          >
            <span className="material-symbols-outlined text-[18px]">dns</span> Configure AI Models
          </Link>
        </div>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-md mb-lg">
        {kpis.map((k) => (
          <div key={k.label} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-1 h-full ${k.tone === 'primary' ? 'bg-primary' : 'bg-tertiary-container'}`} />
            <div className="flex items-center justify-between mb-sm">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">{k.label}</span>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${k.tone === 'primary' ? 'bg-primary-fixed text-primary' : 'bg-tertiary-fixed text-on-tertiary-fixed-variant'}`}>
                <span className="material-symbols-outlined text-[20px]">{k.icon}</span>
              </div>
            </div>
            <div className="font-display text-[36px] leading-none font-bold text-on-surface">{k.value}</div>
            <p className="font-caption text-caption text-on-surface-variant mt-xs">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Top row */}
      <div className="grid grid-cols-12 gap-md mb-lg">
        <div className="col-span-12 lg:col-span-8 glass-panel rounded-xl p-md relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-tertiary-container" />
          <div className="flex justify-between items-center mb-md">
            <h3 className="font-h3 text-h3 flex items-center gap-sm">
              <span className="material-symbols-outlined text-tertiary-container">memory</span> AI Processing Health
            </h3>
            <span className="bg-tertiary-fixed text-on-tertiary-fixed font-label-caps text-label-caps px-sm py-xs rounded-full flex items-center gap-xs">
              <span className="material-symbols-outlined text-[14px]">bolt</span> OPTIMAL
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
            <div className="bg-surface-container-lowest p-md rounded-lg border border-outline-variant">
              <p className="font-caption text-caption text-on-surface-variant mb-xs">Transcription Service</p>
              <div className="flex items-end justify-between">
                <span className="font-h2 text-h2 text-primary">Active</span>
                <span className="font-body-sm text-on-surface-variant">real-time</span>
              </div>
            </div>
            <div className="bg-surface-container-lowest p-md rounded-lg border border-outline-variant">
              <p className="font-caption text-caption text-on-surface-variant mb-xs">Requests (24h)</p>
              <div className="flex items-end gap-sm mb-xs">
                <span className="font-h2 text-h2">42%</span>
              </div>
              <div className="w-full bg-surface-container-high rounded-full h-1.5">
                <div className="bg-primary h-1.5 rounded-full" style={{ width: '42%' }} />
              </div>
            </div>
            <div className="bg-surface-container-lowest p-md rounded-lg border border-outline-variant">
              <p className="font-caption text-caption text-on-surface-variant mb-xs">Model Quota</p>
              <div className="flex items-end gap-sm mb-xs">
                <span className="font-h2 text-h2">18.4</span>
                <span className="font-body-sm text-on-surface-variant pb-1">/ 24</span>
              </div>
              <div className="w-full bg-surface-container-high rounded-full h-1.5">
                <div className="bg-tertiary-container h-1.5 rounded-full" style={{ width: '76%' }} />
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-xl p-md shadow-primary-md relative overflow-hidden">
          <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-[120px] opacity-10">group</span>
          <p className="font-caption text-caption opacity-80 uppercase tracking-wider">Active users right now</p>
          <h2 className="font-display text-display font-bold mt-xs">{s.activeUsers}</h2>
          <p className="font-body-sm opacity-90 mt-xs">
            <span className="font-semibold">+12%</span> vs last month
          </p>
          <Link href="/admin/users" className="mt-md inline-flex items-center gap-xs text-on-primary font-semibold hover:opacity-80">
            Manage users <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </Link>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-12 gap-md mb-lg">
        <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-h3 text-h3 mb-md">Meetings per Month</h3>
          <div className="relative" style={{ height: '280px' }}>
            <MeetingsPerMonth meetings={allMeetings} />
          </div>
        </div>
        <div className="col-span-12 lg:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-h3 text-h3 mb-md">Task Distribution</h3>
          <div className="relative" style={{ height: '280px' }}>
            <TasksDoughnut tasks={allTasks} />
          </div>
        </div>
        <div className="col-span-12 lg:col-span-6 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-h3 text-h3 mb-md">Users by Role</h3>
          <div className="relative" style={{ height: '240px' }}>
            <UsersByRole users={allUsers} />
          </div>
        </div>
        <div className="col-span-12 lg:col-span-6 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-h3 text-h3 mb-md">AI Transcription Accuracy</h3>
          <div className="relative" style={{ height: '240px' }}>
            <AiAccuracyTrend />
          </div>
        </div>
      </div>

      {/* Users + Logs */}
      <div className="grid grid-cols-12 gap-md">
        <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
          <div className="p-md border-b border-outline-variant flex justify-between items-center bg-surface-bright">
            <h3 className="font-h3 text-h3">Recent Users</h3>
            <Link href="/admin/users" className="text-primary hover:underline font-label-caps text-label-caps flex items-center gap-xs">
              MANAGE ALL <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Name</th>
                  <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Role</th>
                  <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Department</th>
                  <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Status</th>
                  <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Joined</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.slice(0, 6).map((u) => {
                  const dept = departments.find((d) => d.id === u.departmentId);
                  return (
                    <tr key={u.id} className="border-b border-outline-variant hover:bg-surface-container-low">
                      <td className="py-sm px-md">
                        <div className="flex items-center gap-sm">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                            {initials(u.name)}
                          </div>
                          <div>
                            <div className="font-semibold">{u.name}</div>
                            <div className="font-caption text-on-surface-variant">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-sm px-md capitalize">{u.role}</td>
                      <td className="py-sm px-md">{dept ? dept.short : '—'}</td>
                      <td className="py-sm px-md">
                        <span className={`pill ${u.active !== false ? 'pill-done' : 'pill-overdue'}`}>
                          {u.active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-sm px-md text-on-surface-variant">{u.joinedAt || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col">
          <h3 className="font-h3 text-h3 mb-md flex items-center justify-between">
            Recent Activity{' '}
            <Link href="/admin/audit" className="text-primary hover:underline text-body-sm font-normal">
              View all
            </Link>
          </h3>
          <div className="flex-1 space-y-sm overflow-y-auto pr-sm max-h-[420px]">
            {auditLog.length === 0 ? (
              <p className="text-on-surface-variant font-body-sm">No activity yet.</p>
            ) : (
              auditLog.map((a) => {
                const [icon, color] = auditIcon(a.action);
                return (
                  <div key={a.id} className="p-sm bg-surface-container-low rounded-lg border border-outline-variant flex gap-sm">
                    <span className={`material-symbols-outlined mt-xs text-[20px] ${color}`}>{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-body-sm text-on-surface truncate">{a.detail || a.action}</p>
                      <p className="font-caption text-caption text-on-surface-variant mt-xs">
                        {fmtDate(a.ts, true)} · {a.userName || 'System'}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
