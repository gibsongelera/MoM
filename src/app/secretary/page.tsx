import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import { Kpi } from '@/components/dashboard/Kpi';

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

  function pillClassFor(status: string) {
    if (status === 'approved') return 'pill-done';
    if (status === 'pending_approval') return 'pill-progress';
    return 'pill-pending';
  }

  return (
    <>
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-md mb-lg">
        <div>
          <h1 className="font-h1 text-h1">Secretary Dashboard</h1>
          <p className="font-body-md text-on-surface-variant">{department ? `${department.name} (${department.short})` : '—'}</p>
        </div>
        <div className="flex gap-sm flex-wrap">
          <a href="/secretary/upload-audio" className="border border-outline-variant px-md py-sm rounded-lg hover:bg-surface-container flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">upload_file</span> Upload Audio
          </a>
          <a href="/secretary/live-recording" className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">mic</span> Start Live Recording
          </a>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-md mb-lg">
        <Kpi label="My Meetings" value={meetingRows.length} icon="event" tone="primary" />
        <Kpi label="Pending Transcript" value={pendingTranscript} icon="closed_caption" tone="tertiary" />
        <Kpi label="MoMs in Draft" value={momsInDraft} icon="description" tone="primary" />
        <Kpi label="Awaiting Approval" value={awaitingApproval} icon="pending_actions" tone="tertiary" />
      </div>

      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
        <h3 className="font-h3 text-h3 mb-md">My Workflow</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
          <a href="/secretary/schedule" className="bg-surface-container-low rounded-lg p-md hover:shadow-primary-md transition-all border border-outline-variant">
            <span className="material-symbols-outlined text-primary text-[28px]">event</span>
            <p className="font-body-md font-semibold mt-sm">Schedule</p>
            <p className="font-caption text-caption text-on-surface-variant mt-xs">Create &amp; manage meetings</p>
          </a>
          <a href="/secretary/live-recording" className="bg-surface-container-low rounded-lg p-md hover:shadow-primary-md transition-all border border-outline-variant">
            <span className="material-symbols-outlined text-primary text-[28px]">mic</span>
            <p className="font-body-md font-semibold mt-sm">Record</p>
            <p className="font-caption text-caption text-on-surface-variant mt-xs">Live or upload capture</p>
          </a>
          <a href="/secretary/transcript" className="bg-surface-container-low rounded-lg p-md hover:shadow-primary-md transition-all border border-outline-variant">
            <span className="material-symbols-outlined text-tertiary-container text-[28px]">closed_caption</span>
            <p className="font-body-md font-semibold mt-sm">Transcripts</p>
            <p className="font-caption text-caption text-on-surface-variant mt-xs">Edit speakers &amp; segments</p>
          </a>
          <a href="/secretary/mom-editor" className="bg-surface-container-low rounded-lg p-md hover:shadow-primary-md transition-all border border-outline-variant">
            <span className="material-symbols-outlined text-primary text-[28px]">description</span>
            <p className="font-body-md font-semibold mt-sm">CHED MoM</p>
            <p className="font-caption text-caption text-on-surface-variant mt-xs">Format minutes</p>
          </a>
        </div>
      </section>

      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden mt-md">
        <div className="p-md border-b border-outline-variant flex items-center justify-between">
          <h3 className="font-h3 text-h3">Recent Department Meetings</h3>
          <a href="/secretary/archives" className="text-primary hover:underline font-label-caps text-label-caps">
            VIEW ARCHIVES
          </a>
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
              {meetingRows.slice(0, 8).map((m) => (
                <tr key={m.id} className="border-b border-outline-variant hover:bg-surface-container-low">
                  <td className="py-sm px-md font-semibold">{m.title}</td>
                  <td className="py-sm px-md text-on-surface-variant">
                    {new Date(m.starts_at).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </td>
                  <td className="py-sm px-md">
                    <span className={`pill ${pillClassFor(m.status)}`}>{m.status.replace('_', ' ')}</span>
                  </td>
                  <td className="py-sm px-md text-right">
                    <a href={`/secretary/transcript?m=${m.id}`} className="text-primary hover:underline font-semibold mr-md">
                      Transcript
                    </a>
                    <a href={`/secretary/mom-editor?m=${m.id}`} className="text-primary hover:underline font-semibold">
                      MoM
                    </a>
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