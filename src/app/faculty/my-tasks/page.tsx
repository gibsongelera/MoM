import { createClient } from '@/lib/supabase/server';
import MyTasksList from '@/components/dashboard/MyTasksList';

export default async function FacultyMyTasksPage() {
  const supabase = await createClient();
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, description, status, priority, deadline, ai_extracted')
    .order('deadline', { ascending: true, nullsFirst: false });

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">My Tasks</h1>
        <p className="font-body-lg text-on-surface-variant">Everything delegated to you, including AI-extracted action items.</p>
      </header>
      <MyTasksList tasks={tasks ?? []} />
    </>
  );
}
