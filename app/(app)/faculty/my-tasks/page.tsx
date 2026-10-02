'use client';

import { useMemo, useState } from 'react';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { useData } from '@/components/DataProvider';
import { updateTaskStatus, logAudit } from '@/lib/db';
import { scopeTasks } from '@/lib/scope';
import type { TaskStatus } from '@/lib/types';

const FILTERS: { f: TaskStatus | ''; label: string }[] = [
  { f: '', label: 'All' },
  { f: 'pending', label: 'Pending' },
  { f: 'in_progress', label: 'In Progress' },
  { f: 'done', label: 'Done' },
];

export default function FacultyMyTasks() {
  const { user, ready } = useRequireRole('faculty');
  usePageTitle('My Tasks');
  const toast = useToast();
  const [filter, setFilter] = useState<TaskStatus | ''>('');
  const { meetings, users, tasks: allTasks, ready: dataReady, refresh } = useData();

  const tasks = useMemo(() => (user ? scopeTasks(user, allTasks) : []), [user, allTasks]);

  if (!ready || !user || !dataReady) return null;

  const list = filter ? tasks.filter((t) => t.status === filter) : tasks;

  async function updateStatus(id: string, status: TaskStatus) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    try {
      await updateTaskStatus(id, status);
    } catch {
      return toast('Could not update status', 'error');
    }
    void logAudit('task_status_changed', `${t.title} -> ${status} (by faculty)`);
    toast(`Status updated to ${status.replace('_', ' ')}`, 'success');
    await refresh();
  }

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">My Tasks</h1>
        <p className="font-body-md text-on-surface-variant">Action items delegated to you from meetings and direct assignments.</p>
      </header>

      <div className="flex gap-sm mb-md flex-wrap">
        {FILTERS.map((b) => (
          <button
            key={b.label}
            onClick={() => setFilter(b.f)}
            className={`px-md py-sm rounded-lg ${filter === b.f ? 'bg-primary text-on-primary shadow-primary-md' : 'border border-outline-variant'}`}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        {list.length === 0 ? (
          <p className="col-span-full text-center text-on-surface-variant py-xl">No tasks match the filter.</p>
        ) : (
          list.map((t) => {
            const m = meetings.find((x) => x.id === t.meetingId);
            const delegator = users.find((u) => u.id === t.delegatedBy);
            const overdue = t.deadline && t.status !== 'done' && new Date(t.deadline) < new Date();
            const priorityCls = t.priority === 'high' ? 'border-l-error' : t.priority === 'medium' ? 'border-l-tertiary-container' : 'border-l-secondary';
            return (
              <div key={t.id} className={`bg-surface-container-lowest border border-outline-variant border-l-4 ${priorityCls} rounded-xl p-md`}>
                <div className="flex items-start justify-between gap-sm mb-sm">
                  <h3 className="font-h3 text-h3 flex-1">{t.title}</h3>
                  {t.aiExtracted ? <span className="ai-badge">AI</span> : null}
                </div>
                {t.description ? <p className="font-body-sm text-on-surface-variant mb-sm">{t.description}</p> : null}
                <div className="flex flex-wrap gap-sm mb-md items-center">
                  <span className={`pill ${t.status === 'done' ? 'pill-done' : t.status === 'in_progress' ? 'pill-progress' : 'pill-pending'}`}>
                    {t.status.replace('_', ' ')}
                  </span>
                  <span className={`pill ${t.priority === 'high' ? 'pill-overdue' : t.priority === 'medium' ? 'pill-progress' : 'pill-pending'}`}>
                    {t.priority}
                  </span>
                  {t.deadline ? (
                    <span className={`font-caption text-caption flex items-center gap-xs ${overdue ? 'text-error font-semibold' : 'text-on-surface-variant'}`}>
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      {t.deadline}
                      {overdue ? ' (overdue)' : ''}
                    </span>
                  ) : null}
                </div>
                <div className="pt-md border-t border-outline-variant flex items-center justify-between text-caption gap-sm">
                  <p className="text-on-surface-variant min-w-0 truncate">
                    From: {m ? m.title : '—'}
                    {delegator ? ` · ${delegator.name}` : ''}
                  </p>
                  <select
                    value={t.status}
                    onChange={(e) => updateStatus(t.id, e.target.value as TaskStatus)}
                    className="bg-surface-container border-transparent focus:border-primary rounded-lg py-xs px-sm text-body-sm"
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
