import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import DepartmentsManager, { type DepartmentRow, type HeadOption } from '@/components/admin/DepartmentsManager';

export const metadata: Metadata = { title: 'Departments | ZPPSU SmartMin' };

export default async function AdminDepartmentsPage() {
  await requireRole('admin');
  const supabase = await createClient();
  const [departmentsRes, profilesRes, meetingsRes] = await Promise.all([
    supabase.from('departments').select('id, name, short, type, office_location, head_id').order('name'),
    supabase.from('profiles').select('id, name, role, active, department_id').order('name'),
    supabase.from('meetings').select('department_id'),
  ]);
  if (departmentsRes.error) throw new Error(`Could not load departments: ${departmentsRes.error.message}`);

  const departments = departmentsRes.data ?? [];
  const profiles = profilesRes.data ?? [];
  const count = (list: { department_id: string | null }[], id: string) => list.filter((x) => x.department_id === id).length;
  const shortOf = new Map(departments.map((d) => [d.id, d.short as string]));

  const rows: DepartmentRow[] = departments.map((d) => ({
    ...(d as Omit<DepartmentRow, 'members' | 'meetings'>),
    members: count(profiles, d.id),
    meetings: count(meetingsRes.data ?? [], d.id),
  }));

  // Heads first, then admins; inactive accounts can't approve anything.
  const heads: HeadOption[] = profiles
    .filter((p) => p.active && (p.role === 'head' || p.role === 'admin'))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'head' ? -1 : 1))
    .map((p) => ({ id: p.id, name: p.name, role: p.role, department_short: p.department_id ? (shortOf.get(p.department_id) ?? null) : null }));

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Departments &amp; Offices</h1>
        <p className="font-body-lg text-on-surface-variant">Colleges and administrative offices that meetings and users belong to.</p>
      </header>
      <DepartmentsManager rows={rows} heads={heads} />
    </>
  );
}
