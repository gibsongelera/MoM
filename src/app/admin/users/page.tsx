import { createClient } from '@/lib/supabase/server';
import UsersTable from '@/components/dashboard/UsersTable';

export default async function AdminUsersPage() {
  const supabase = await createClient();

  const [{ data: users }, { data: departments }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name, email, role, active, position, department_id, joined_at')
      .order('name'),
    supabase.from('departments').select('id, short'),
  ]);

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">User Management</h1>
        <p className="font-body-lg text-on-surface-variant">
          Activate self-registered accounts, change roles, and see who belongs to which department.
        </p>
      </header>
      <UsersTable users={users ?? []} departments={departments ?? []} />
    </>
  );
}
