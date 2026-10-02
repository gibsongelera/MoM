import { createClient } from '@/lib/supabase/server';
import NewDepartmentForm from '@/components/dashboard/NewDepartmentForm';

export default async function AdminDepartmentsPage() {
  const supabase = await createClient();
  const { data: departments } = await supabase
    .from('departments')
    .select('id, name, short, type, office_location, head_id')
    .order('name');

  const headIds = (departments ?? []).map((d) => d.head_id).filter((id): id is string => Boolean(id));
  const { data: heads } = headIds.length
    ? await supabase.from('profiles').select('id, name').in('id', headIds)
    : { data: [] as { id: string; name: string }[] };
  const headName = new Map((heads ?? []).map((h) => [h.id, h.name]));

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Departments &amp; Offices</h1>
        <p className="font-body-lg text-on-surface-variant">Colleges and administrative offices that meetings and users belong to.</p>
      </header>

      <div className="mb-lg">
        <NewDepartmentForm />
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
        <table className="w-full text-left text-body-sm">
          <thead className="bg-surface-container-low border-b border-outline-variant">
            <tr>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Name</th>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Short</th>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Type</th>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Head</th>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Location</th>
            </tr>
          </thead>
          <tbody>
            {(departments ?? []).map((d) => (
              <tr key={d.id} className="border-b border-outline-variant hover:bg-surface-container-low">
                <td className="py-sm px-md font-semibold">{d.name}</td>
                <td className="py-sm px-md">{d.short}</td>
                <td className="py-sm px-md capitalize">{d.type}</td>
                <td className="py-sm px-md text-on-surface-variant">{d.head_id ? (headName.get(d.head_id) ?? '—') : '—'}</td>
                <td className="py-sm px-md text-on-surface-variant">{d.office_location ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}