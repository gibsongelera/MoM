import { createClient } from '@/lib/supabase/server';

export default async function FacultyMyMeetingsPage() {
  const supabase = await createClient();
  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, starts_at, venue, status, meeting_type')
    .order('starts_at', { ascending: false });

  function pillClassFor(status: string) {
    if (status === 'approved') return 'pill-done';
    if (status === 'pending_approval') return 'pill-progress';
    return 'pill-pending';
  }

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">My Meetings</h1>
        <p className="font-body-lg text-on-surface-variant">Meetings in your department, and any meeting you&apos;re a participant in.</p>
      </header>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl divide-y divide-outline-variant">
        {(meetings ?? []).length === 0 ? (
          <p className="p-md text-on-surface-variant">No meetings yet.</p>
        ) : (
          (meetings ?? []).map((m) => (
            <div key={m.id} className="p-md flex items-center justify-between hover:bg-surface-container-low transition-colors">
              <div className="flex items-center gap-md">
                <div className="w-10 h-10 rounded-lg bg-primary text-on-primary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined">event</span>
                </div>
                <div>
                  <p className="font-body-md font-semibold">{m.title}</p>
                  <p className="font-caption text-caption text-on-surface-variant">
                    {new Date(m.starts_at).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ·{' '}
                    {m.venue || 'TBA'}
                  </p>
                </div>
              </div>
              <span className={`pill ${pillClassFor(m.status)}`}>{m.status.replace('_', ' ')}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
