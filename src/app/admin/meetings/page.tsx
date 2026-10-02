import { createClient } from '@/lib/supabase/server';

export default async function AdminMeetingsPage() {
  const supabase = await createClient();
  const [{ data: meetings }, { data: departments }] = await Promise.all([
    supabase
      .from('meetings')
      .select('id, title, starts_at, status, meeting_type, department_id')
      .order('starts_at', { ascending: false })
      .limit(100),
    supabase.from('departments').select('id, short'),
  ]);
  const deptShort = new Map((departments ?? []).map((d) => [d.id, d.short]));

  function pillClassFor(status: string) {
    if (status === 'approved') return 'pill-done';
    if (status === 'pending_approval') return 'pill-progress';
    if (status === 'archived') return 'pill-overdue';
    return 'pill-pending';
  }

  function typePillClassFor(type: string) {
    if (type === 'capstone') return 'pill-capstone';
    if (type === 'research') return 'pill-research';
    return 'pill-regular';
  }

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">All Meetings</h1>
        <p className="font-body-lg text-on-surface-variant">Every meeting across every department. Most recent 100.</p>
      </header>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
        <table className="w-full text-left text-body-sm">
          <thead className="bg-surface-container-low border-b border-outline-variant">
            <tr>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Meeting</th>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Department</th>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Type</th>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Date</th>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Status</th>
            </tr>
          </thead>
          <tbody>
            {(meetings ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="py-md px-md text-center text-on-surface-variant">
                  No meetings yet.
                </td>
              </tr>
            ) : (
              (meetings ?? []).map((m) => (
                <tr key={m.id} className="border-b border-outline-variant hover:bg-surface-container-low">
                  <td className="py-sm px-md font-semibold">{m.title}</td>
                  <td className="py-sm px-md">{m.department_id ? (deptShort.get(m.department_id) ?? '—') : '—'}</td>
                  <td className="py-sm px-md">
                    <span className={`pill ${typePillClassFor(m.meeting_type)}`}>{m.meeting_type}</span>
                  </td>
                  <td className="py-sm px-md text-on-surface-variant">
                    {new Date(m.starts_at).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="py-sm px-md">
                    <span className={`pill ${pillClassFor(m.status)}`}>{m.status.replace('_', ' ')}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
