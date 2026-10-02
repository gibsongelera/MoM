import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import PrintButton from '@/components/dashboard/PrintButton';

export default async function HeadReportsPage() {
  const user = await requireRole('head');
  const supabase = await createClient();

  const [{ data: department }, { data: meetings }, { data: tasks }] = await Promise.all([
    user.department_id
      ? supabase.from('departments').select('name, short').eq('id', user.department_id).single()
      : Promise.resolve({ data: null }),
    supabase.from('meetings').select('id, title, starts_at, status, meeting_type'),
    supabase.from('tasks').select('id, status'),
  ]);

  const meetingRows = meetings ?? [];
  const approved = meetingRows.filter((m) => m.status === 'approved').length;
  const pending = meetingRows.filter((m) => m.status === 'pending_approval').length;
  const doneTasks = (tasks ?? []).filter((t) => t.status === 'done').length;
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;

  return (
    <div className="ched-doc">
      <div className="flex justify-between items-start mb-lg no-print">
        <div />
        <PrintButton />
      </div>

      <div className="text-center mb-lg">
        <h1 className="font-h1 text-h1">Quarterly Governance Report</h1>
        <p className="font-body-md text-on-surface-variant">
          {department ? `${department.name} (${department.short})` : 'Department'} · Q{quarter} {now.getFullYear()}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-md mb-lg">
        <div className="text-center border border-outline-variant rounded-lg p-md">
          <p className="font-display text-[32px] font-bold text-primary">{meetingRows.length}</p>
          <p className="font-caption text-caption text-on-surface-variant">Total Meetings</p>
        </div>
        <div className="text-center border border-outline-variant rounded-lg p-md">
          <p className="font-display text-[32px] font-bold text-primary">{approved}</p>
          <p className="font-caption text-caption text-on-surface-variant">Minutes Approved</p>
        </div>
        <div className="text-center border border-outline-variant rounded-lg p-md">
          <p className="font-display text-[32px] font-bold text-primary">{doneTasks}</p>
          <p className="font-caption text-caption text-on-surface-variant">Tasks Completed</p>
        </div>
      </div>

      <table className="w-full text-left text-body-sm mb-lg">
        <thead>
          <tr className="border-b border-outline-variant">
            <th className="py-sm">Meeting</th>
            <th className="py-sm">Type</th>
            <th className="py-sm">Date</th>
            <th className="py-sm">Status</th>
          </tr>
        </thead>
        <tbody>
          {meetingRows.map((m) => (
            <tr key={m.id} className="border-b border-outline-variant">
              <td className="py-sm">{m.title}</td>
              <td className="py-sm capitalize">{m.meeting_type}</td>
              <td className="py-sm">{new Date(m.starts_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
              <td className="py-sm">{m.status.replace('_', ' ')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="font-caption text-caption text-on-surface-variant">
        {pending} document{pending === 1 ? '' : 's'} still awaiting signature as of this report.
      </p>
    </div>
  );
}
