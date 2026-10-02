'use client';

import { useMemo, useState } from 'react';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { useData } from '@/components/DataProvider';
import { saveTask, deleteTask, updateTaskStatus, notifyUser, logAudit } from '@/lib/db';
import { scopeTasks, scopeUsers } from '@/lib/scope';
import { initials } from '@/lib/utils';
import type { TaskPriority, TaskStatus } from '@/lib/types';

const COLUMNS: { status: TaskStatus; label: string; dot: string }[] = [
  { status: 'pending', label: 'Pending', dot: 'bg-surface-variant' },
  { status: 'in_progress', label: 'In Progress', dot: 'bg-tertiary-container' },
  { status: 'done', label: 'Done', dot: 'bg-success' },
];

const emptyForm = {
  id: '',
  title: '',
  description: '',
  assigneeId: '',
  priority: 'medium' as TaskPriority,
  deadline: '',
  status: 'pending' as TaskStatus,
};

export default function HeadDelegate() {
  const { user, ready } = useRequireRole('head');
  usePageTitle('Task Delegation');
  const toast = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const editing = !!form.id;

  const { users, tasks: allTasks, ready: dataReady, refresh } = useData();

  const team = useMemo(
    () => (user ? scopeUsers(user, users).filter((u) => u.role === 'faculty' || u.role === 'secretary') : []),
    [user, users],
  );
  const tasks = useMemo(() => (user ? scopeTasks(user, allTasks) : []), [user, allTasks]);

  if (!ready || !user || !dataReady) return null;

  function openAdd() {
    setForm(emptyForm);
    setModalOpen(true);
  }
  function openEdit(id: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    setForm({
      id: t.id,
      title: t.title,
      description: t.description || '',
      assigneeId: t.assigneeId || '',
      priority: t.priority || 'medium',
      deadline: t.deadline || '',
      status: t.status,
    });
    setModalOpen(true);
  }
  function remind(t: { id: string; title: string; assigneeId?: string; deadline?: string }) {
    if (!t.assigneeId) return;
    void notifyUser(t.assigneeId, 'task', 'Task reminder', `Reminder: "${t.title}"${t.deadline ? ' — due ' + t.deadline : ''}`);
    void logAudit('task_reminder', `${t.title} reminder sent`);
    toast('Reminder sent to assignee.', 'success');
  }

  async function moveTask(id: string, status: TaskStatus) {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    try {
      await updateTaskStatus(id, status);
    } catch {
      return toast('Could not move task', 'error');
    }
    void logAudit('task_status_changed', `${t.title} -> ${status}`);
    toast(`"${t.title.slice(0, 30)}" moved to ${status.replace('_', ' ')}`, 'success');
    await refresh();
  }
  async function del(id: string) {
    if (!window.confirm('Delete this task?')) return;
    const t = tasks.find((x) => x.id === id);
    try {
      await deleteTask(id);
    } catch {
      return toast('Could not delete task', 'error');
    }
    void logAudit('task_deleted', t?.title || id);
    toast('Task deleted', 'success');
    setModalOpen(false);
    await refresh();
  }
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const existing = form.id ? tasks.find((x) => x.id === form.id) : null;
    let saved;
    try {
      saved = await saveTask({
        id: form.id || undefined,
        title: form.title.trim(),
        description: form.description.trim(),
        assigneeId: form.assigneeId || undefined,
        priority: form.priority,
        deadline: form.deadline,
        status: form.status,
        departmentId: existing?.departmentId || user!.departmentId,
        delegatedBy: user!.id,
        aiExtracted: existing?.aiExtracted || false,
      });
    } catch {
      return toast('Could not save task', 'error');
    }
    void logAudit(existing ? 'task_updated' : 'task_created', saved.title);
    if (saved.assigneeId && saved.assigneeId !== existing?.assigneeId) {
      void notifyUser(saved.assigneeId, 'task', 'New task delegated', `${user!.name} assigned you: ${saved.title}`);
    }
    toast(`Task ${existing ? 'updated' : 'created'}`, 'success');
    setModalOpen(false);
    await refresh();
  }

  const inputCls = 'w-full px-md py-sm bg-surface-container-low border-2 border-transparent focus:border-primary rounded-lg';

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-md mb-lg">
        <div>
          <h1 className="font-h1 text-h1">Task Delegation Board</h1>
          <p className="font-body-md text-on-surface-variant">Drag cards between columns to update status. Click a card to assign or edit.</p>
        </div>
        <button onClick={openAdd} className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md flex items-center gap-xs">
          <span className="material-symbols-outlined text-[18px]">add_task</span> Create Task
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        {COLUMNS.map((col) => {
          const filtered = tasks.filter((t) => t.status === col.status);
          return (
            <div
              key={col.status}
              className={`kanban-col bg-surface-container rounded-xl p-md border-2 ${dragOver === col.status ? 'drag-over' : 'border-transparent'}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.status);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData('text/plain');
                if (id) moveTask(id, col.status);
              }}
            >
              <div className="flex items-center justify-between mb-md">
                <h3 className="font-h3 text-h3 flex items-center gap-sm">
                  <span className={`w-3 h-3 rounded-full ${col.dot}`} /> {col.label}
                </h3>
                <span className="font-label-caps text-label-caps bg-surface-container-lowest px-sm py-xs rounded-full">{filtered.length}</span>
              </div>
              <div className="space-y-sm min-h-[200px]">
                {filtered.length === 0 ? (
                  <div className="text-center text-on-surface-variant py-md font-caption">Drop tasks here</div>
                ) : (
                  filtered.map((t) => {
                    const a = team.find((u) => u.id === t.assigneeId) || (t.assigneeId ? users.find((u) => u.id === t.assigneeId) : null);
                    const priorityCls = t.priority === 'high' ? 'border-l-error' : t.priority === 'medium' ? 'border-l-tertiary-container' : 'border-l-secondary';
                    const overdue = t.deadline && t.status !== 'done' && new Date(t.deadline) < new Date();
                    return (
                      <div
                        key={t.id}
                        className={`kanban-card bg-surface-container-lowest border border-outline-variant border-l-4 ${priorityCls} rounded-lg p-sm cursor-pointer`}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
                        onClick={() => openEdit(t.id)}
                      >
                        <div className="flex items-start justify-between gap-xs mb-xs">
                          <p className="font-body-sm font-semibold flex-1 leading-tight">{t.title}</p>
                          <div className="flex items-center gap-xs shrink-0">
                            {t.aiExtracted ? <span className="material-symbols-outlined text-[14px] text-tertiary-container" title="AI extracted">auto_awesome</span> : null}
                            {t.assigneeId && t.status !== 'done' ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); remind(t); }}
                                title="Send reminder to assignee"
                                className={`material-symbols-outlined text-[15px] ${overdue ? 'text-error' : 'text-on-surface-variant'} hover:text-primary`}
                              >
                                notifications_active
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {t.description ? <p className="font-caption text-caption text-on-surface-variant mb-sm line-clamp-2">{t.description.slice(0, 90)}</p> : null}
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-xs">
                            {a ? (
                              <>
                                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px]">{initials(a.name)}</div>
                                <span className="text-on-surface-variant">{a.name.split(' ').slice(0, 2).join(' ')}</span>
                              </>
                            ) : (
                              <span className="text-on-surface-variant italic">Unassigned</span>
                            )}
                          </div>
                          {t.deadline ? (
                            <span className={`font-caption text-[10px] flex items-center gap-xs ${overdue ? 'text-error font-semibold' : 'text-on-surface-variant'}`}>
                              <span className="material-symbols-outlined text-[12px]">schedule</span>
                              {t.deadline}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Task' : 'Create Task'}>
        <form onSubmit={onSubmit} className="space-y-md">
          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Title</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Description</label>
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-md">
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Assignee</label>
              <select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })} className={inputCls}>
                <option value="">— Unassigned —</option>
                {team.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })} className={inputCls}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Deadline</label>
              <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })} className={inputCls}>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>
          <div className="flex justify-between pt-md border-t border-outline-variant">
            {editing ? (
              <button type="button" onClick={() => del(form.id)} className="text-error hover:bg-error/10 px-md py-sm rounded-lg flex items-center gap-xs">
                <span className="material-symbols-outlined text-[18px]">delete</span> Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-sm ml-auto">
              <button type="button" onClick={() => setModalOpen(false)} className="px-md py-sm rounded-lg border border-outline-variant">
                Cancel
              </button>
              <button type="submit" className="px-md py-sm rounded-lg bg-primary text-on-primary shadow-primary-md flex items-center gap-xs">
                <span className="material-symbols-outlined text-[18px]">save</span> Save
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
