import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import { Kpi } from '@/components/dashboard/Kpi';
import { initials } from '@/lib/utils/initials';

/** Port of head/dashboard.html. RLS (sm_can_see_meeting / profiles_select)
 * already scopes meetings/tasks/profiles to this head's department, so the
 * queries below need no manual department_id filter - unlike the legacy
 * scopeMeetings()/scopeTasks()/scopeUsers() client-side filters they
 * replace, the scoping cannot be bypassed from the browser console. */
export default async function HeadDashboardPage() {
  const user = await requireRole('head');
  const supabase = await createClient();

  const [{ data: department }, { data: meetings }, { data: tasks }, { data: team }] = await Promise.all([
    user.department_id
      ? supabase.from('departments').select('name, short').eq('id', user.department_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from('meetings')
      .select('id, title, starts_at, status')
      .order('starts_at', { ascending: false }),
    supabase.from('tasks').select('status'),
    supabase.from('profiles').select('id, name, position, role, active').order('name'),
  ]);

  const meetingRows = meetings ?? [];
  const pending = meetingRows.filter((m) => m.status === 'pending_approval');
  const activeTasks = (tasks ?? []).filter((t) => t.status !== 'done').length;
  const teamMembers = team ?? [];

  function pillClassFor(status: string) {
    if (status === 'approved') return 'pill-done';
    if (status === 'pending_approval') return 'pill-progress';
    return 'pill-pending';
  }

  return (
    <>
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-md mb-lg">
        <div>
          <h1 className="font-h1 text-h1">Department Overview</h1>
          <p className="font-body-lg text-on-surface-variant">{department ? `${department.name} (${department.short})` : '—'}</p>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-md mb-lg">
        <Kpi label="Department Meetings" value={meetingRows.length} icon="event" tone="primary" />
        <Kpi label="Pending Approvals" value={pending.length} icon="pending_actions" tone="tertiary" />
        <Kpi label="Active Tasks" value={activeTasks} icon="task_alt" tone="primary" />
        <Kpi label="Team Members" value={teamMembers.length} icon="groups" tone="tertiary" />
      </div>

      <div className="grid grid-cols-12 gap-md mb-lg">
        <section className="col-span-12 lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
          <div className="p-md border-b border-outline-variant flex justify-between items-center">
            <h3 className="font-h3 text-h3 flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary">pending_actions</span> Awaiting My Signature
            </h3>
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
                        {new Date(m.starts_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} · MoM
                        ready for approval
                      </p>
                    </div>
                  </div>
                  <span className="bg-primary text-on-primary px-md py-xs rounded-lg shadow-primary-md flex items-center gap-xs font-semibold text-body-sm">
                    <span className="material-symbols-outlined text-[16px]">draw</span> Review
                  </span>
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
            {teamMembers.slice(0, 6).map((u) => (
              <div key={u.id} className="flex items-center gap-sm p-sm rounded-lg hover:bg-surface-container-low transition-colors">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                  {initials(u.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body-sm font-semibold truncate">{u.name}</p>
                  <p className="font-caption text-caption text-on-surface-variant truncate">{u.position || u.role}</p>
                </div>
                <span className={`material-symbols-outlined text-[18px] ${u.active ? 'text-success' : 'text-on-surface-variant'}`}>
                  {u.active ? 'circle' : 'block'}
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
              </tr>
            </thead>
            <tbody>
              {meetingRows.slice(0, 8).map((m) => (
                <tr key={m.id} className="border-b border-outline-variant hover:bg-surface-container-low">
                  <td className="py-sm px-md font-semibold">{m.title}</td>
                  <td className="py-sm px-md text-on-surface-variant">
                    {new Date(m.starts_at).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </td>
                  <td className="py-sm px-md">
                    <span className={`pill ${pillClassFor(m.status)}`}>{m.status.replace('_', ' ')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}