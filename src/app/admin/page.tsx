import { createClient } from '@/lib/supabase/server';
import { Kpi } from '@/components/dashboard/Kpi';
import { MeetingsLineChart, TasksDoughnutChart, RolesBarChart, JobsStatusChart } from '@/components/dashboard/charts';
import { initials } from '@/lib/utils/initials';

/**
 * Port of admin/dashboard.html.
 *
 * Two sections deliberately do NOT carry over their legacy content:
 *  - "Local AI Processing Health" showed hardcoded Whisper v3 / CPU / GPU
 *    numbers describing infrastructure this system does not have (we use
 *    ElevenLabs Scribe v2 + Claude Opus 5, not a local Whisper/LLaMA stack).
 *    Replaced with real transcription_jobs status counts.
 *  - The "AI Transcription Accuracy" chart plotted a hardcoded array with
 *    the source comment "Synthesized monthly accuracy trend (96-99%)" - a
 *    fabricated number. Replaced with the same real job-status data as a
 *    chart. A real accuracy measurement needs the Phase 8 evaluation
 *    harness (human reference transcripts + WER scoring), which does not
 *    exist yet.
 * "Export Backup" (legacy: dumped localStorage to a JSON file) is dropped -
 * there is no longer a client-side store to dump.
 */
export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [
    { data: profiles },
    { data: departments },
    { data: meetings },
    { count: pendingApprovals },
    { count: transcriptsCompleted },
    { data: tasks },
    { data: jobs },
    { data: auditRows },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name, email, role, active, joined_at, department_id, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('departments').select('id, short'),
    supabase.from('meetings').select('starts_at'),
    supabase.from('minutes').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval'),
    supabase.from('transcripts').select('id', { count: 'exact', head: true }),
    supabase.from('tasks').select('status'),
    supabase.from('transcription_jobs').select('status'),
    supabase
      .from('audit_log')
      .select('action, detail, user_name, created_at')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const users = profiles ?? [];
  const activeUsers = users.filter((u) => u.active).length;
  const deptShort = new Map((departments ?? []).map((d) => [d.id, d.short]));

  const now = new Date();
  const meetingsThisMonth = (meetings ?? []).filter((m) => {
    const d = new Date(m.starts_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const monthCounts = Array(12).fill(0);
  (meetings ?? []).forEach((m) => {
    const d = new Date(m.starts_at);
    if (!Number.isNaN(d.getTime())) monthCounts[d.getMonth()] += 1;
  });

  const taskBuckets = { pending: 0, in_progress: 0, done: 0 };
  (tasks ?? []).forEach((t) => {
    if (t.status in taskBuckets) taskBuckets[t.status as keyof typeof taskBuckets] += 1;
  });

  const roleBuckets = { admin: 0, head: 0, secretary: 0, faculty: 0 };
  users.forEach((u) => {
    if (u.role in roleBuckets) roleBuckets[u.role as keyof typeof roleBuckets] += 1;
  });

  const jobBuckets = { inProgress: 0, completed: 0, failed: 0 };
  (jobs ?? []).forEach((j) => {
    if (j.status === 'completed') jobBuckets.completed += 1;
    else if (j.status === 'failed' || j.status === 'cancelled') jobBuckets.failed += 1;
    else jobBuckets.inProgress += 1;
  });
  const totalJobs = (jobs ?? []).length;
  const healthLabel = jobBuckets.failed > 0 ? 'ATTENTION' : totalJobs === 0 ? 'IDLE' : 'OPERATIONAL';

  function iconFor(action: string): [string, string] {
    if (action.includes('transcri')) return ['auto_awesome', 'text-tertiary-container'];
    if (action.includes('approve') || action.includes('sign')) return ['check_circle', 'text-success'];
    if (action.includes('login') || action.includes('logout')) return ['login', 'text-primary'];
    if (action.includes('role') || action.includes('user')) return ['group_add', 'text-secondary'];
    if (action.includes('recording')) return ['mic', 'text-primary'];
    if (action.includes('task')) return ['task_alt', 'text-tertiary-container'];
    return ['info', 'text-on-surface-variant'];
  }

  return (
    <>
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-md mb-lg">
        <div>
          <h1 className="font-h1 text-h1 text-on-surface">Executive Overview</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            High-level state of ZPPSU governance and AI processing.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-md mb-lg">
        <Kpi label="Active Users" value={activeUsers} icon="group" tone="primary" />
        <Kpi label="Meetings This Month" value={meetingsThisMonth} icon="event" tone="tertiary" />
        <Kpi label="Transcripts Completed" value={transcriptsCompleted ?? 0} icon="auto_awesome" tone="tertiary" />
        <Kpi label="Pending Approvals" value={pendingApprovals ?? 0} icon="pending_actions" tone="primary" />
      </div>

      <div className="grid grid-cols-12 gap-md mb-lg">
        <div className="col-span-12 lg:col-span-8 glass-panel rounded-xl p-md relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-tertiary-container" />
          <div className="flex justify-between items-center mb-md">
            <h3 className="font-h3 text-h3 flex items-center gap-sm">
              <span className="material-symbols-outlined text-tertiary-container">auto_awesome</span> AI Transcription
              Pipeline
            </h3>
            <span className="bg-tertiary-fixed text-on-tertiary-fixed-variant font-label-caps text-label-caps px-sm py-xs rounded-full flex items-center gap-xs">
              <span className="material-symbols-outlined text-[14px]">bolt</span> {healthLabel}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
            <div className="bg-surface-container-lowest p-md rounded-lg border border-outline-variant">
              <p className="font-caption text-caption text-on-surface-variant mb-xs">Provider</p>
              <div className="flex items-end justify-between">
                <span className="font-h2 text-h2 text-primary">ElevenLabs</span>
                <span className="font-body-sm text-on-surface-variant">Scribe v2</span>
              </div>
            </div>
            <div className="bg-surface-container-lowest p-md rounded-lg border border-outline-variant">
              <p className="font-caption text-caption text-on-surface-variant mb-xs">In Progress</p>
              <div className="flex items-end gap-sm mb-xs">
                <span className="font-h2 text-h2">{jobBuckets.inProgress}</span>
              </div>
            </div>
            <div className="bg-surface-container-lowest p-md rounded-lg border border-outline-variant">
              <p className="font-caption text-caption text-on-surface-variant mb-xs">Completed / Failed</p>
              <div className="flex items-end gap-sm mb-xs">
                <span className="font-h2 text-h2">{jobBuckets.completed}</span>
                <span className="font-body-sm text-on-surface-variant pb-1">/ {jobBuckets.failed} failed</span>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-xl p-md shadow-primary-md relative overflow-hidden">
          <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-[120px] opacity-10">group</span>
          <p className="font-caption text-caption opacity-80 uppercase tracking-wider">Active accounts</p>
          <h2 className="font-display text-display font-bold mt-xs">{activeUsers}</h2>
          <p className="font-body-sm opacity-90 mt-xs">of {users.length} total accounts</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-md mb-lg">
        <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-h3 text-h3 mb-md">Meetings per Month</h3>
          <div className="relative" style={{ height: 280 }}>
            <MeetingsLineChart countsByMonth={monthCounts} />
          </div>
        </div>
        <div className="col-span-12 lg:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-h3 text-h3 mb-md">Task Distribution</h3>
          <div className="relative" style={{ height: 280 }}>
            <TasksDoughnutChart pending={taskBuckets.pending} inProgress={taskBuckets.in_progress} done={taskBuckets.done} />
          </div>
        </div>
        <div className="col-span-12 lg:col-span-6 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-h3 text-h3 mb-md">Users by Role</h3>
          <div className="relative" style={{ height: 240 }}>
            <RolesBarChart admin={roleBuckets.admin} head={roleBuckets.head} secretary={roleBuckets.secretary} faculty={roleBuckets.faculty} />
          </div>
        </div>
        <div className="col-span-12 lg:col-span-6 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-h3 text-h3 mb-md">Transcription Jobs</h3>
          <div className="relative" style={{ height: 240 }}>
            <JobsStatusChart
              queued={jobBuckets.inProgress}
              processing={0}
              completed={jobBuckets.completed}
              failed={jobBuckets.failed}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-md">
        <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
          <div className="p-md border-b border-outline-variant flex justify-between items-center bg-surface-bright">
            <h3 className="font-h3 text-h3">Recent Users</h3>
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
                {users.slice(0, 6).map((u) => (
                  <tr key={u.id} className="border-b border-outline-variant hover:bg-surface-container-low">
                    <td className="py-sm px-md flex items-center gap-sm">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                        {initials(u.name)}
                      </div>
                      <div>
                        <div className="font-semibold">{u.name}</div>
                        <div className="font-caption text-on-surface-variant">{u.email}</div>
                      </div>
                    </td>
                    <td className="py-sm px-md capitalize">{u.role}</td>
                    <td className="py-sm px-md">{u.department_id ? (deptShort.get(u.department_id) ?? '—') : '—'}</td>
                    <td className="py-sm px-md">
                      <span className={`pill ${u.active ? 'pill-done' : 'pill-overdue'}`}>{u.active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="py-sm px-md text-on-surface-variant">{u.joined_at ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col">
          <h3 className="font-h3 text-h3 mb-md">Recent Activity</h3>
          <div className="flex-1 space-y-sm overflow-y-auto pr-sm max-h-[420px]">
            {(auditRows ?? []).length === 0 ? (
              <p className="text-on-surface-variant font-body-sm">No activity yet.</p>
            ) : (
              (auditRows ?? []).map((a, i) => {
                const [icon, color] = iconFor(a.action);
                const when = new Date(a.created_at).toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                });
                return (
                  <div key={i} className="p-sm bg-surface-container-low rounded-lg border border-outline-variant flex gap-sm">
                    <span className={`material-symbols-outlined mt-xs text-[20px] ${color}`}>{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-body-sm text-on-surface truncate">{a.detail || a.action}</p>
                      <p className="font-caption text-caption text-on-surface-variant mt-xs">
                        {when} · {a.user_name || 'System'}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}