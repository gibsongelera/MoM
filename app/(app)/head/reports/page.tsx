'use client';

import { useMemo, useState } from 'react';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { SignModal } from '@/components/SignModal';
import { MeetingsPerMonth, TasksDoughnut } from '@/components/Charts';
import { useData } from '@/components/DataProvider';
import { logAudit } from '@/lib/db';
import { scopeMeetings, scopeTasks, statsFor } from '@/lib/scope';
import { ROLE_LABEL } from '@/lib/nav';
import { fmtDate } from '@/lib/utils';

export default function HeadReports() {
  const { user, ready } = useRequireRole('head');
  usePageTitle('Reports');
  const toast = useToast();
  const [signOpen, setSignOpen] = useState(false);
  const [sigUrl, setSigUrl] = useState('');
  const { meetings: allMeetings, tasks: allTasks, users, departments, ready: dataReady } = useData();

  const data = useMemo(() => {
    if (!user) return null;
    const dept = departments.find((d) => d.id === user.departmentId);
    const meetings = scopeMeetings(user, allMeetings);
    const tasks = scopeTasks(user, allTasks);
    const stats = statsFor(user, { meetings: allMeetings, tasks: allTasks, users });
    return { dept, meetings, tasks, users, stats };
  }, [user, departments, allMeetings, allTasks, users]);

  if (!ready || !user || !dataReady || !data) return null;
  const { dept, meetings, tasks, stats } = data;

  const kpis = [
    { l: 'Meetings', v: meetings.length, i: 'event' },
    { l: 'AI-Transcribed', v: meetings.filter((m) => m.aiProcessed).length, i: 'auto_awesome' },
    { l: 'Tasks Closed', v: stats.tasksDone, i: 'task_alt' },
    { l: 'Hours Saved', v: `${stats.aiHoursSaved}h`, i: 'savings' },
  ];

  const summary = `During the reporting period, ${dept?.short || 'the department'} conducted ${meetings.length} meetings, of which ${meetings.filter((m) => m.aiProcessed).length} were AI-transcribed. A total of ${tasks.length} action items were tracked, with ${stats.tasksDone} completed, ${stats.tasksInProgress} in progress, and ${stats.pendingTasks} pending. AI automation saved an estimated ${stats.aiHoursSaved} hours of manual documentation effort. There ${stats.pendingApprovals === 1 ? 'is' : 'are'} currently ${stats.pendingApprovals} document${stats.pendingApprovals === 1 ? '' : 's'} pending approval.`;

  const outstanding = tasks.filter((t) => t.status !== 'done').slice(0, 10);

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-md mb-lg no-print">
        <div>
          <h1 className="font-h1 text-h1">Department Reports</h1>
          <p className="font-body-md text-on-surface-variant">{dept ? `${dept.name} (${dept.short})` : ''}</p>
        </div>
        <div className="flex gap-sm">
          <button onClick={() => setSignOpen(true)} className="border border-primary text-primary px-md py-sm rounded-lg hover:bg-primary-fixed/30 flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">draw</span> Sign Report
          </button>
          <button onClick={() => window.print()} className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span> Print / Export PDF
          </button>
        </div>
      </header>

      <div className="ched-doc">
        <div className="text-center border-b-2 border-primary pb-md mb-lg">
          <div className="w-16 h-16 mx-auto mb-sm rounded-full bg-primary text-on-primary flex items-center justify-center shadow-primary-md">
            <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>account_balance</span>
          </div>
          <p className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest mb-xs">Zamboanga Peninsula Polytechnic State University</p>
          <h2 className="font-h2 text-h2 text-primary font-bold">{dept ? dept.name.toUpperCase() : 'Department'}</h2>
          <h1 className="font-h1 text-h1 mt-sm">Quarterly Governance Report</h1>
          <p className="font-caption text-caption text-on-surface-variant mt-xs">Generated {fmtDate(Date.now(), true)}</p>
        </div>

        <section className="mb-xl">
          <h3 className="font-h3 text-h3 text-primary mb-md">Executive Summary</h3>
          <p className="text-body-md text-on-surface">{summary}</p>
        </section>

        <section className="mb-xl">
          <h3 className="font-h3 text-h3 text-primary mb-md">Key Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
            {kpis.map((k) => (
              <div key={k.l} className="bg-surface-container-low border border-outline-variant rounded-lg p-md text-center">
                <span className="material-symbols-outlined text-primary text-[24px]">{k.i}</span>
                <p className="font-h2 text-h2 font-bold mt-xs">{k.v}</p>
                <p className="font-caption text-caption text-on-surface-variant">{k.l}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-xl">
          <h3 className="font-h3 text-h3 text-primary mb-md">Meetings Conducted</h3>
          <div className="relative" style={{ height: '240px' }}>
            <MeetingsPerMonth meetings={meetings} />
          </div>
        </section>

        <section className="mb-xl">
          <h3 className="font-h3 text-h3 text-primary mb-md">Task Performance</h3>
          <div className="relative" style={{ height: '240px' }}>
            <TasksDoughnut tasks={tasks} />
          </div>
        </section>

        <section className="mb-xl">
          <h3 className="font-h3 text-h3 text-primary mb-md">Outstanding Action Items</h3>
          <table className="w-full text-left text-body-sm">
            <thead>
              <tr className="border-b-2 border-outline-variant text-on-surface-variant font-label-caps text-label-caps uppercase">
                <th className="py-sm px-md">Task</th>
                <th className="py-sm px-md">Assignee</th>
                <th className="py-sm px-md">Deadline</th>
                <th className="py-sm px-md">Status</th>
              </tr>
            </thead>
            <tbody>
              {outstanding.length === 0 ? (
                <tr><td colSpan={4} className="py-md text-center text-on-surface-variant">No outstanding items.</td></tr>
              ) : (
                outstanding.map((t) => {
                  const a = users.find((u) => u.id === t.assigneeId);
                  const pill = t.status === 'in_progress' ? 'pill-progress' : 'pill-pending';
                  return (
                    <tr key={t.id} className="border-b border-outline-variant/50">
                      <td className="py-sm px-md">{t.title}</td>
                      <td className="py-sm px-md">{a ? a.name : <em>Unassigned</em>}</td>
                      <td className="py-sm px-md">{t.deadline || '—'}</td>
                      <td className="py-sm px-md"><span className={`pill ${pill}`}>{t.status.replace('_', ' ')}</span></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>

        <section className="mt-xxl pt-lg border-t border-outline-variant grid grid-cols-2 gap-xl">
          <div className="text-center">
            <div className="h-[80px] mb-xs flex items-end justify-center">
              <span className="font-caption text-on-surface-variant italic">Prepared by</span>
            </div>
            <div className="border-t border-on-surface-variant w-[80%] mx-auto pt-xs">
              <p className="font-body-md font-bold">SmartMin AI System</p>
              <p className="font-caption text-caption text-on-surface-variant">Automated quarterly aggregation</p>
            </div>
          </div>
          <div className="text-center">
            <div className="h-[80px] mb-xs flex items-end justify-center">
              {sigUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sigUrl} className="max-h-[70px]" alt="signature" />
              ) : (
                <button onClick={() => setSignOpen(true)} className="bg-surface border border-dashed border-primary text-primary px-md py-sm rounded-lg hover:bg-primary-fixed/20 flex items-center gap-xs no-print">
                  <span className="material-symbols-outlined text-[16px]">draw</span> Click to Sign
                </button>
              )}
            </div>
            <div className="border-t border-on-surface-variant w-[80%] mx-auto pt-xs">
              <p className="font-body-md font-bold">{user.name}</p>
              <p className="font-caption text-caption text-on-surface-variant">{ROLE_LABEL[user.role]}</p>
            </div>
          </div>
        </section>
      </div>

      <SignModal
        open={signOpen}
        onClose={() => setSignOpen(false)}
        title="Sign Quarterly Report"
        subtitle="Your signature certifies the accuracy of this report."
        onConfirm={(url) => {
          setSigUrl(url);
          void logAudit('report_signed', `Quarterly Report (${dept?.short})`);
          toast('Report signed. Ready to export.', 'success');
        }}
      />
    </div>
  );
}
