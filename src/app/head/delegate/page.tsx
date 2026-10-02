import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import DelegateBoard, { type DelegateTaskRow, type TeamMember } from '@/components/dashboard/DelegateBoard';

export default async function HeadDelegatePage() {
  const user = await requireRole('head');
  const supabase = await createClient();

  const [{ data: tasks }, { data: team }] = await Promise.all([
    supabase.from('tasks').select('id, title, status, priority, deadline, assignee_id'),
    supabase.from('profiles').select('id, name').eq('department_id', user.department_id ?? '').order('name'),
  ]);

  const nameById = new Map((team ?? []).map((t) => [t.id, t.name]));
  const rows: DelegateTaskRow[] = (tasks ?? []).map((t) => ({
    ...t,
    assignee_name: t.assignee_id ? (nameById.get(t.assignee_id) ?? null) : null,
  }));
  const members: TeamMember[] = team ?? [];

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Task Delegation</h1>
        <p className="font-body-lg text-on-surface-variant">Assign work to your department and track it through to done.</p>
      </header>
      {members.length === 0 ? (
        <p className="text-on-surface-variant">No department set on your profile, or no team members found.</p>
      ) : (
        <DelegateBoard tasks={rows} team={members} departmentId={user.department_id} />
      )}
    </>
  );
}
