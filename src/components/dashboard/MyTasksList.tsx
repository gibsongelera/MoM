'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { TaskStatus } from '@/lib/types/domain';

export interface MyTaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: string;
  deadline: string | null;
  ai_extracted: boolean;
}

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  pending: 'in_progress',
  in_progress: 'done',
  done: 'pending',
};
const STATUS_LABEL: Record<TaskStatus, string> = { pending: 'Pending', in_progress: 'In Progress', done: 'Done' };

export default function MyTasksList({ tasks }: { tasks: MyTaskRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function advance(task: MyTaskRow) {
    setPendingId(task.id);
    await supabase.from('tasks').update({ status: NEXT_STATUS[task.status] }).eq('id', task.id);
    setPendingId(null);
    router.refresh();
  }

  if (tasks.length === 0) {
    return <p className="p-md text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-xl">No tasks assigned to you yet.</p>;
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl divide-y divide-outline-variant">
      {tasks.map((t) => {
        const overdue = t.deadline && t.status !== 'done' && new Date(t.deadline) < new Date();
        return (
          <div key={t.id} className="p-md flex items-center justify-between gap-md hover:bg-surface-container-low transition-colors">
            <div className="flex items-start gap-md flex-1 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined">checklist</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-body-md font-semibold">{t.title}</p>
                {t.description ? <p className="font-body-sm text-on-surface-variant mt-xs">{t.description}</p> : null}
                <div className="flex gap-sm mt-xs flex-wrap">
                  {t.ai_extracted ? <span className="pill pill-ai">AI Extracted</span> : null}
                  <span className={`pill ${t.status === 'in_progress' ? 'pill-progress' : t.status === 'done' ? 'pill-done' : 'pill-pending'}`}>
                    {STATUS_LABEL[t.status]}
                  </span>
                  <span className="pill pill-regular capitalize">{t.priority}</span>
                  {t.deadline ? (
                    <span className={`font-caption text-caption ${overdue ? 'text-error font-semibold' : 'text-on-surface-variant'}`}>
                      <span className="material-symbols-outlined text-[12px] align-middle">schedule</span> {t.deadline}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <button
              onClick={() => advance(t)}
              disabled={pendingId === t.id}
              className="shrink-0 bg-primary text-on-primary px-md py-xs rounded-lg shadow-primary-md font-semibold text-body-sm disabled:opacity-60"
            >
              {pendingId === t.id ? '...' : `Mark ${STATUS_LABEL[NEXT_STATUS[t.status]]}`}
            </button>
          </div>
        );
      })}
    </div>
  );
}