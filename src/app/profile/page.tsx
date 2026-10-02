import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth/requireRole';
import ProfileForm from '@/components/dashboard/ProfileForm';

export default async function ProfilePage() {
  const user = await requireAuth();
  const supabase = await createClient();

  let departmentLabel = '—';
  if (user.department_id) {
    const { data: department } = await supabase
      .from('departments')
      .select('name, short')
      .eq('id', user.department_id)
      .single();
    if (department) departmentLabel = `${department.name} (${department.short})`;
  }

  return (
    <div className="max-w-[960px] mx-auto w-full">
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">My Profile</h1>
        <p className="font-body-md text-on-surface-variant">
          Manage your name, position, and optional photo. Sensitive personal fields (age, gender) are intentionally not collected.
        </p>
      </header>
      <ProfileForm user={user} departmentLabel={departmentLabel} />
    </div>
  );
}
