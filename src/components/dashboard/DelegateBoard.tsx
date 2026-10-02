'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { TaskStatus } from '@/lib/types/domain';

export interface DelegateTaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string;
  deadline: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
}

export interface TeamMember {
  id: string;
  name: string;
}

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'pending', label: 'Pending' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'done', label: 'Done' },
];

/**
 * Real-data task board. True HTML5 drag-and-drop (the legacy .kanban-card /
 * .kanban-col interaction) is left for a follow-up - move-left/move-right
 * buttons are the same underlying status update with far less surface area
 * to get wrong on a first pass, and the .kanban-card styling still applies.
 */
export default function DelegateBoard({
  tasks,
  team,
  departmentId,
}: {
  tasks: DelegateTaskRow[];
  team: TeamMember[];
  departmentId: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState(team[0]?.id ?? '');
  const [priority, setPriority] = useState('medium');
  const [deadline, setDeadline] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(task: DelegateTaskRow, direction: 1 | -1) {
    const idx = COLUMNS.findIndex((c) => c.status === task.status);
    const next = COLUMNS[idx + direction];
    if (!next) return;
    setPendingId(task.id);
    await supabase.from('tasks').update({ status: next.status }).eq('id', task.id);
    setPendingId(null);
    router.refresh();
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !assigneeId) {
      setError('Title and assignee are required.');
      return;
    }
    setCreating(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from('tasks').insert({
      title: title.trim(),
      assignee_id: assigneeId,
      delegated_by: user?.id ?? null,
      department_id: departmentId,
      priority,
      deadline: deadline || null,
      status: 'pending',
    });
    setCreating(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setTitle('');
    setDeadline('');
    router.refresh();
  }

  return (
    <>
      <form onSubmit={handleCreate} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md mb-lg grid grid-cols-1 md:grid-cols-5 gap-sm items-end">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" className="md:col-span-2 rounded-lg border-outline-variant bg-surface-container font-body-sm" />
        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="rounded-lg border-outline-variant bg-surface-container font-body-sm">
          {team.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded-lg border-outline-variant bg-surface-container font-body-sm">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="rounded-lg border-outline-variant bg-surface-container font-body-sm" />
        <button type="submit" disabled={creating} className="md:col-span-5 justify-self-end bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md font-semibold disabled:opacity-60">
          {creating ? 'Delegating...' : 'Delegate Task'}
        </button>
        {error ? <p className="md:col-span-5 text-error font-body-sm">{error}</p> : null}
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        {COLUMNS.map((col, colIdx) => (
          <div key={col.status} className="kanban-col bg-surface-container-low rounded-xl p-sm">
            <h3 className="font-h3 text-h3 mb-sm px-sm">
              {col.label} <span className="font-caption text-on-surface-variant">({tasks.filter((t) => t.status === col.status).length})</span>
            </h3>
            <div className="space-y-sm">
              {tasks
                .filter((t) => t.status === col.status)
                .map((t) => {
                  const overdue = t.deadline && t.status !== 'done' && new Date(t.deadline) < new Date();
                  return (
                    <div key={t.id} className="kanban-card bg-surface-container-lowest border border-outline-variant rounded-lg p-sm">
                      <p className="font-body-sm font-semibold">{t.title}</p>
                      <p className="font-caption text-caption text-on-surface-variant mt-xs">{t.assignee_name ?? 'Unassigned'}</p>
                      <div className="flex gap-xs mt-xs flex-wrap">
                        <span className="pill pill-regular capitalize">{t.priority}</span>
                        {t.deadline ? <span className={`font-caption text-caption ${overdue ? 'text-error font-semibold' : 'text-on-surface-variant'}`}>{t.deadline}</span> : null}
                      </div>
                      <div className="flex justify-between mt-sm">
                        <button
                          onClick={() => move(t, -1)}
                          disabled={colIdx === 0 || pendingId === t.id}
                          className="text-on-surface-variant hover:text-primary disabled:opacity-30 text-body-sm"
                        >
                          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                        </button>
                        <button
                          onClick={() => move(t, 1)}
                          disabled={colIdx === COLUMNS.length - 1 || pendingId === t.id}
                          className="text-on-surface-variant hover:text-primary disabled:opacity-30 text-body-sm"
                        >
                          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}