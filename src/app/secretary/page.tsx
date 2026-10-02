import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import { Kpi } from '@/components/dashboard/Kpi';
import { MeetingStatusPill } from '@/components/ui/StatusPill';
import { Icon } from '@/components/ui/Icon';
import { buttonClasses } from '@/components/ui/Button';
import { fmtManila } from '@/lib/utils/datetime';

/**
 * Port of secretary/dashboard.html.
 *
 * The legacy "Offline Queue" section read from IndexedDB (browser-only
 * storage for recordings made while offline) - there is nothing server-side
 * to render for that here, and the upload flow this Next.js app uses
 * (POST /api/audio/upload-url, see Phase 3) is a direct signed upload
 * rather than an IndexedDB queue, so the section is dropped rather than
 * faked with empty state.
 */
export default async function SecretaryDashboardPage() {
  const user = await requireRole('secretary');
  const supabase = await createClient();

  const [{ data: department }, { data: meetings }] = await Promise.all([
    user.department_id
      ? supabase.from('departments').select('name, short').eq('id', user.department_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from('meetings')
      .select('id, title, starts_at, status, ai_processed')
      .order('starts_at', { ascending: false }),
  ]);

  const meetingRows = meetings ?? [];
  const pendingTranscript = meetingRows.filter((m) => !m.ai_processed).length;
  const momsInDraft = meetingRows.filter((m) => m.status === 'transcribed').length;
  const awaitingApproval = meetingRows.filter((m) => m.status === 'pending_approval').length;

  return (
    <>
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-md mb-lg">
        <div>
          <h1 className="font-h1 text-h1">Secretary Dashboard</h1>
          <p className="font-body-md text-on-surface-variant">{department ? `${department.name} (${department.short})` : '—'}</p>
        </div>
        <div className="flex gap-sm flex-wrap">
          <Link href="/secretary/meetings?emergency=1" className={buttonClasses('secondary')}>
            <Icon name="emergency" size={18} /> Start emergency meeting
          </Link>
          <Link href="/secretary/meetings" className={buttonClasses('primary')}>
            <Icon name="event" size={18} /> Meetings
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-md mb-lg">
        <Kpi label="My Meetings" value={meetingRows.length} icon="event" tone="primary" />
        <Kpi label="Pending Transcript" value={pendingTranscript} icon="closed_caption" tone="tertiary" />
        <Kpi label="Minutes to write" value={momsInDraft} icon="description" tone="primary" />
        <Kpi label="Awaiting Approval" value={awaitingApproval} icon="pending_actions" tone="tertiary" />
      </div>

      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
        <h2 className="font-h3 text-h3 mb-md">My workflow</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
          {[
            { href: '/secretary/meetings', icon: 'event', label: 'Meetings', hint: 'Schedule or start one now' },
            { href: '/secretary/live-recording', icon: 'mic', label: 'Record', hint: 'Record or upload audio' },
            { href: '/secretary/transcript', icon: 'closed_caption', label: 'Transcripts', hint: 'Fix speakers and text' },
            { href: '/secretary/mom-editor', icon: 'description', label: 'Minutes', hint: 'Write, sign and route' },
          ].map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="bg-surface-container-low rounded-lg p-md border border-outline-variant transition-shadow duration-150 hover:shadow-primary-md"
            >
              <Icon name={t.icon} size={28} className="text-primary" />
              <p className="font-body-md font-semibold mt-sm">{t.label}</p>
              <p className="font-caption text-caption text-on-surface-variant mt-xs">{t.hint}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden mt-md">
        <div className="p-md border-b border-outline-variant flex items-center justify-between">
          <h2 className="font-h3 text-h3">Recent department meetings</h2>
          <Link href="/secretary/archives" className={buttonClasses('ghost', 'sm')}>
            Meeting History <Icon name="arrow_forward" size={18} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                <th scope="col" className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Meeting</th>
                <th scope="col" className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Date</th>
                <th scope="col" className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Status</th>
                <th scope="col" className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {meetingRows.slice(0, 8).map((m) => (
                <tr key={m.id} className="border-b border-outline-variant hover:bg-surface-container-low">
                  <td className="py-sm px-md font-semibold">{m.title}</td>
                  <td className="py-sm px-md text-on-surface-variant">
                    {fmtManila(m.starts_at)}
                  </td>
                  <td className="py-sm px-md">
                    <MeetingStatusPill status={m.status} />
                  </td>
                  <td className="py-sm px-md text-right">
                    <Link href={`/secretary/meetings/${m.id}`} className="text-primary hover:underline font-semibold">
                      Open
                    </Link>
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