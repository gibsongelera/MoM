import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import { Kpi } from '@/components/dashboard/Kpi';

/** Port of faculty/dashboard.html. RLS scopes tasks to assignee_id/
 * delegated_by = auth.uid(), meetings to department + participation, and
 * personal_meetings/notifications strictly to user_id = auth.uid() - so
 * every query below is already "mine" without an explicit filter. */
export default async function FacultyDashboardPage() {
  const user = await requireRole('faculty');
  const supabase = await createClient();

  const [{ data: department }, { data: tasks }, { data: meetings }, { count: transcriptCount }, { data: personal }, { data: notifs }] =
    await Promise.all([
      user.department_id
        ? supabase.from('departments').select('name, short').eq('id', user.department_id).single()
        : Promise.resolve({ data: null }),
      supabase.from('tasks').select('id, title, status, deadline, ai_extracted'),
      supabase.from('meetings').select('id, title, starts_at, venue'),
      supabase.from('transcripts').select('id', { count: 'exact', head: true }),
      supabase
        .from('personal_meetings')
        .select('id, title, meeting_date, meeting_time, type, attendees')
        .order('meeting_date', { ascending: false })
        .limit(4),
      supabase.from('notifications').select('id, type, title, body, read, created_at').order('created_at', { ascending: false }).limit(5),
    ]);

  const taskRows = tasks ?? [];
  const openTasks = taskRows.filter((t) => t.status !== 'done');
  const doneTasks = taskRows.filter((t) => t.status === 'done').length;

  // Server Component, evaluated once per request at render time - "now" for
  // this upcoming-meetings filter is supposed to be request time, not a
  // stable historical value, so the purity rule (aimed at client re-renders)
  // does not apply here.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const upcoming = (meetings ?? [])
    .filter((m) => new Date(m.starts_at).getTime() >= now - 86400000)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, 5);

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">My Dashboard</h1>
        <p className="font-body-md text-on-surface-variant">{department ? `${department.name} (${department.short})` : '—'}</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-md mb-lg">
        <Kpi label="Open Tasks" value={openTasks.length} icon="task_alt" tone="primary" />
        <Kpi label="Completed" value={doneTasks} icon="check_circle" tone="tertiary" />
        <Kpi label="My Meetings" value={(meetings ?? []).length} icon="event" tone="primary" />
        <Kpi label="AI Transcripts" value={transcriptCount ?? 0} icon="closed_caption" tone="tertiary" />
      </div>

      <div className="grid grid-cols-12 gap-md">
        <section className="col-span-12 lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
          <div className="p-md border-b border-outline-variant flex justify-between items-center">
            <h3 className="font-h3 text-h3 flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary">task_alt</span> My Active Tasks
            </h3>
          </div>
          <div className="divide-y divide-outline-variant">
            {openTasks.length === 0 ? (
              <p className="p-md text-on-surface-variant">All caught up! No active tasks.</p>
            ) : (
              openTasks.slice(0, 6).map((t) => {
                const overdue = t.deadline ? new Date(t.deadline) < new Date() : false;
                return (
                  <div key={t.id} className="p-md flex items-center justify-between hover:bg-surface-container-low transition-colors">
                    <div className="flex items-start gap-md flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined">checklist</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-body-md font-semibold truncate">{t.title}</p>
                        <div className="flex gap-sm mt-xs">
                          {t.ai_extracted ? <span className="pill pill-ai">AI Extracted</span> : null}
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
                      {new Date(m.starts_at).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ·{' '}
                      {m.venue || 'TBA'}
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
          <a href="/faculty/personal-meetings" className="text-primary hover:underline font-label-caps text-label-caps">
            VIEW ALL
          </a>
        </div>
        <div className="space-y-sm">
          {(personal ?? []).length === 0 ? (
            <p className="text-on-surface-variant text-body-sm italic">
              No personal meetings logged yet. Use the Personal Meetings page to track your one-on-ones and advising sessions.
            </p>
          ) : (
            (personal ?? []).map((p) => (
              <div key={p.id} className="block p-sm bg-surface-container-low rounded-lg border border-outline-variant">
                <div className="flex items-baseline gap-sm">
                  <p className="font-body-sm font-semibold flex-1 truncate">{p.title}</p>
                  <span className="pill pill-regular">{p.type || 'Personal'}</span>
                </div>
                <p className="font-caption text-caption text-on-surface-variant">
                  {p.meeting_date} {p.meeting_time ? `· ${p.meeting_time}` : ''}
                  {p.attendees ? ` · ${p.attendees}` : ''}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md mt-md">
        <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm">
          <span className="material-symbols-outlined text-tertiary-container">notifications_active</span> Recent Notifications
        </h3>
        <div className="space-y-sm">
          {(notifs ?? []).length === 0 ? (
            <p className="text-on-surface-variant">No notifications.</p>
          ) : (
            (notifs ?? []).map((n) => (
              <div key={n.id} className={`p-sm rounded-lg flex items-start gap-sm ${n.read ? 'bg-surface-container-low' : 'bg-tertiary-fixed/30 border-l-4 border-tertiary-container'}`}>
                <span className={`material-symbols-outlined mt-xs ${n.type === 'ai' ? 'text-tertiary-container' : n.type === 'approval' ? 'text-primary' : 'text-on-surface-variant'}`}>
                  {n.type === 'ai' ? 'auto_awesome' : n.type === 'approval' ? 'fact_check' : n.type === 'task' ? 'task_alt' : 'info'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-body-sm font-semibold">{n.title}</p>
                  <p className="font-caption text-caption text-on-surface-variant">
                    {n.body} ·{' '}
                    {new Date(n.created_at).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}