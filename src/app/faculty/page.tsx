import Link from 'next/link';
import { humanize } from '@/lib/ui/status';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import { fmtManila } from '@/lib/utils/datetime';
import { fmtPersonalWhen, type TranscriptStatus } from '@/lib/personal/types';
import { Kpi } from '@/components/dashboard/Kpi';
import { Icon } from '@/components/ui/Icon';
import { TranscriptPill } from '@/components/personal/TranscriptPill';
import AskAssistantButton from '@/components/assistant/AskAssistantButton';

/** Faculty dashboard. RLS scopes tasks to assignee_id/delegated_by =
 * auth.uid(), meetings to department + participation, and
 * personal_meetings/notifications strictly to user_id = auth.uid() - so
 * every query below is already "mine" without an explicit filter. */
export default async function FacultyDashboardPage() {
  const user = await requireRole('faculty');
  const supabase = await createClient();

  const [{ data: department }, { data: tasks }, { data: meetings }, { count: transcriptCount }, { data: personal }, { data: recordings }, { data: notifs }] =
    await Promise.all([
      user.department_id
        ? supabase.from('departments').select('name, short').eq('id', user.department_id).single()
        : Promise.resolve({ data: null }),
      supabase.from('tasks').select('id, title, status, deadline, ai_extracted'),
      supabase.from('meetings').select('id, title, starts_at, venue'),
      supabase.from('transcripts').select('id', { count: 'exact', head: true }),
      supabase
        .from('personal_meetings')
        .select('id, title, meeting_date, meeting_time, type, attendees, follow_up_date')
        .eq('user_id', user.id)
        .is('archived_at', null)
        .order('meeting_date', { ascending: false })
        .limit(4),
      supabase
        .from('personal_meetings')
        .select('id, title, meeting_date, meeting_time, transcript_status, meeting_id, archived_at')
        .eq('user_id', user.id)
        .not('audio_path', 'is', null)
        .order('audio_uploaded_at', { ascending: false })
        .limit(5),
      supabase.from('notifications').select('id, type, title, body, read, created_at').order('created_at', { ascending: false }).limit(5),
    ]);

  const taskRows = tasks ?? [];
  const openTasks = taskRows.filter((t) => t.status !== 'done');

  // Server Component, evaluated once per request at render time - "now" for
  // this upcoming-meetings filter is supposed to be request time, not a
  // stable historical value, so the purity rule (aimed at client re-renders)
  // does not apply here.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const upcoming = (meetings ?? [])
    .filter((m) => new Date(m.starts_at).getTime() >= now - 3 * 3_600_000)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, 5);
  const myTranscripts = (recordings ?? []).filter((r) => r.transcript_status === 'completed').length;

  const quickActions = [
    { href: '/faculty/personal-meetings?new=recording', icon: 'graphic_eq', title: 'Upload or record a meeting', body: 'Get a private transcript of an advising session or a meeting you attended.' },
    { href: '/faculty/personal-meetings?new=log', icon: 'edit_note', title: 'Log a meeting', body: 'Note who you met, what was agreed, and when to follow up.' },
    { href: '/faculty/transcript-view', icon: 'closed_caption', title: 'Read transcripts', body: 'Official meeting transcripts and your own recordings in one place.' },
  ];

  return (
    <>
      <header className="mb-lg flex flex-col gap-md md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-h1 text-h1">My Dashboard</h1>
          <p className="font-body-md text-on-surface-variant">{department ? `${department.name} (${department.short})` : '—'}</p>
        </div>
        <AskAssistantButton label="Ask the assistant" />
      </header>

      <div className="mb-lg grid grid-cols-2 gap-md lg:grid-cols-4">
        <Kpi label="Open Tasks" value={openTasks.length} icon="task_alt" tone="primary" />
        <Kpi label="Upcoming Meetings" value={upcoming.length} icon="event" tone="primary" />
        <Kpi label="My Recordings" value={(recordings ?? []).length} icon="graphic_eq" tone="tertiary" />
        <Kpi label="Transcripts" value={(transcriptCount ?? 0) + myTranscripts} icon="closed_caption" tone="tertiary" />
      </div>

      <section aria-labelledby="quick-h" className="mb-lg">
        <h2 id="quick-h" className="sr-only">
          Quick actions
        </h2>
        <ul className="grid grid-cols-1 gap-md md:grid-cols-3">
          {quickActions.map((a) => (
            <li key={a.href}>
              <Link
                href={a.href}
                className="group flex h-full items-start gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md transition-[border-color,box-shadow] duration-150 hover:border-primary hover:shadow-primary-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary">
                  <Icon name={a.icon} size={24} />
                </span>
                <span className="min-w-0">
                  <span className="block font-body-md font-semibold group-hover:text-primary">{a.title}</span>
                  <span className="block font-body-sm text-on-surface-variant">{a.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-12 gap-md">
        <section className="col-span-12 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest lg:col-span-7">
          <div className="flex items-center justify-between border-b border-outline-variant p-md">
            <h3 className="flex items-center gap-sm font-h3 text-h3">
              <Icon name="task_alt" className="text-primary" /> My Active Tasks
            </h3>
            <Link href="/faculty/my-tasks" className="font-label-caps text-label-caps text-primary hover:underline">
              VIEW ALL
            </Link>
          </div>
          <div className="divide-y divide-outline-variant">
            {openTasks.length === 0 ? (
              <p className="p-md text-on-surface-variant">All caught up! No active tasks.</p>
            ) : (
              openTasks.slice(0, 6).map((t) => {
                const overdue = t.deadline ? new Date(t.deadline) < new Date() : false;
                return (
                  <div key={t.id} className="flex items-center justify-between p-md">
                    <div className="flex min-w-0 flex-1 items-start gap-md">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon name="checklist" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-body-md font-semibold">{t.title}</p>
                        <div className="mt-xs flex flex-wrap items-center gap-sm">
                          {t.ai_extracted ? <span className="pill pill-ai">AI Extracted</span> : null}
                          <span className={`pill ${t.status === 'in_progress' ? 'pill-progress' : 'pill-pending'}`}>{humanize(t.status)}</span>
                          {t.deadline ? (
                            <span className={`inline-flex items-center gap-xs font-caption text-caption ${overdue ? 'font-semibold text-error' : 'text-on-surface-variant'}`}>
                              <Icon name="schedule" size={14} /> {t.deadline}
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

        <section className="col-span-12 rounded-xl border border-outline-variant bg-surface-container-lowest p-md lg:col-span-5">
          <div className="mb-md flex items-center justify-between">
            <h3 className="flex items-center gap-sm font-h3 text-h3">
              <Icon name="event_upcoming" className="text-primary" /> Upcoming Meetings
            </h3>
            <Link href="/faculty/my-meetings" className="font-label-caps text-label-caps text-primary hover:underline">
              VIEW ALL
            </Link>
          </div>
          <ul className="space-y-sm">
            {upcoming.length === 0 ? (
              <li className="text-on-surface-variant">No upcoming meetings.</li>
            ) : (
              upcoming.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/faculty/my-meetings/${m.id}`}
                    className="flex items-center gap-sm rounded-lg border border-outline-variant bg-surface-container-low p-sm transition-colors duration-150 hover:border-primary"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary">
                      <Icon name="event" size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-body-sm font-semibold">{m.title}</span>
                      <span className="block font-caption text-caption text-on-surface-variant">
                        {fmtManila(m.starts_at)} · {m.venue || 'TBA'}
                      </span>
                    </span>
                    <Icon name="chevron_right" className="text-on-surface-variant" />
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="col-span-12 rounded-xl border border-outline-variant bg-surface-container-lowest p-md lg:col-span-7">
          <div className="mb-md flex items-center justify-between">
            <h3 className="flex items-center gap-sm font-h3 text-h3">
              <Icon name="graphic_eq" className="text-primary" /> My Recordings
            </h3>
            <Link href="/faculty/personal-meetings?new=recording" className="font-label-caps text-label-caps text-primary hover:underline">
              + UPLOAD
            </Link>
          </div>
          {(recordings ?? []).length === 0 ? (
            <p className="font-body-sm text-on-surface-variant">
              No recordings yet. Upload a recording of an advising session — or of a meeting you attended — and SmartMin transcribes it for you, privately.
            </p>
          ) : (
            <ul className="divide-y divide-outline-variant">
              {(recordings ?? []).map((r) => (
                <li key={r.id}>
                  <Link href={`/faculty/personal-meetings/${r.id}`} className="flex items-center gap-sm py-sm transition-colors duration-150 hover:text-primary">
                    <Icon name={r.meeting_id ? 'groups' : 'person'} className="text-on-surface-variant" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-body-sm font-semibold">{r.title}</span>
                      <span className="block font-caption text-caption text-on-surface-variant">
                        {fmtPersonalWhen(r.meeting_date, r.meeting_time)}
                        {r.archived_at ? ' · archived' : ''}
                      </span>
                    </span>
                    <TranscriptPill status={r.transcript_status as TranscriptStatus} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="col-span-12 rounded-xl border border-outline-variant bg-surface-container-lowest p-md lg:col-span-5">
          <div className="mb-md flex items-center justify-between">
            <h3 className="flex items-center gap-sm font-h3 text-h3">
              <Icon name="event_available" className="text-primary" /> Personal Meeting Log
            </h3>
            <Link href="/faculty/personal-meetings" className="font-label-caps text-label-caps text-primary hover:underline">
              VIEW ALL
            </Link>
          </div>
          <ul className="space-y-sm">
            {(personal ?? []).length === 0 ? (
              <li className="font-body-sm italic text-on-surface-variant">No personal meetings logged yet.</li>
            ) : (
              (personal ?? []).map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/faculty/personal-meetings/${p.id}`}
                    className="block rounded-lg border border-outline-variant bg-surface-container-low p-sm transition-colors duration-150 hover:border-primary"
                  >
                    <span className="flex items-baseline gap-sm">
                      <span className="flex-1 truncate font-body-sm font-semibold">{p.title}</span>
                      <span className="pill pill-regular">{p.type || 'Personal'}</span>
                    </span>
                    <span className="block font-caption text-caption text-on-surface-variant">
                      {fmtPersonalWhen(p.meeting_date, p.meeting_time)}
                      {p.attendees ? ` · ${p.attendees}` : ''}
                    </span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <section className="mt-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
        <h3 className="mb-md flex items-center gap-sm font-h3 text-h3">
          <Icon name="notifications_active" className="text-tertiary" /> Recent Notifications
        </h3>
        <div className="space-y-sm">
          {(notifs ?? []).length === 0 ? (
            <p className="text-on-surface-variant">No notifications.</p>
          ) : (
            (notifs ?? []).map((n) => (
              <div key={n.id} className={`flex items-start gap-sm rounded-lg p-sm ${n.read ? 'bg-surface-container-low' : 'border-l-4 border-tertiary-container bg-tertiary-fixed/30'}`}>
                <Icon
                  name={n.type === 'ai' ? 'auto_awesome' : n.type === 'approval' ? 'fact_check' : n.type === 'task' ? 'task_alt' : 'info'}
                  className={`mt-xs ${n.type === 'ai' ? 'text-tertiary' : n.type === 'approval' ? 'text-primary' : 'text-on-surface-variant'}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-body-sm font-semibold">{n.title}</p>
                  <p className="font-caption text-caption text-on-surface-variant">
                    {n.body} · {fmtManila(n.created_at)}
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
