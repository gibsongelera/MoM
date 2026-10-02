import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { MeetingType } from '@/lib/types/domain';

const GROUP_LABEL: Record<MeetingType, string> = { regular: 'Regular', capstone: 'Capstone', research: 'Research' };
const GROUP_ICON: Record<MeetingType, string> = { regular: 'folder', capstone: 'school', research: 'science' };

export default async function SecretaryArchivesPage() {
  const supabase = await createClient();
  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, starts_at, meeting_type, sub_type, status')
    .order('starts_at', { ascending: false });

  const groups: Record<MeetingType, typeof meetings> = { regular: [], capstone: [], research: [] };
  (meetings ?? []).forEach((m) => {
    groups[m.meeting_type as MeetingType]?.push(m);
  });

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Archives</h1>
        <p className="font-body-lg text-on-surface-variant">Every meeting, grouped by type.</p>
      </header>

      <div className="space-y-lg">
        {(Object.keys(groups) as MeetingType[]).map((type) => (
          <section key={type}>
            <h3 className="font-h3 text-h3 mb-sm flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary">{GROUP_ICON[type]}</span>
              {GROUP_LABEL[type]} <span className="font-caption text-on-surface-variant">({groups[type]?.length ?? 0})</span>
            </h3>
            {!groups[type] || groups[type].length === 0 ? (
              <p className="text-on-surface-variant font-body-sm">None yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-sm">
                {groups[type].map((m) => (
                  <Link key={m.id} href={`/secretary/mom-editor?m=${m.id}`} className="folder-card block">
                    <p className="font-body-md font-semibold truncate">{m.title}</p>
                    {m.sub_type ? <p className="font-caption text-caption text-on-surface-variant">{m.sub_type}</p> : null}
                    <p className="font-caption text-caption text-on-surface-variant mt-xs">
                      {new Date(m.starts_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                    <span className={`pill mt-xs ${m.status === 'approved' ? 'pill-done' : 'pill-pending'}`}>{m.status.replace('_', ' ')}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
