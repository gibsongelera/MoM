'use client';

import { useMemo, useState } from 'react';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { useData } from '@/components/DataProvider';
import { logAudit } from '@/lib/db';
import { scopeUsers } from '@/lib/scope';
import { initials } from '@/lib/utils';
import type { Role, User } from '@/lib/types';

const MAX_SECRETARIES = 2;

export default function HeadMembers() {
  const { user, ready } = useRequireRole('head');
  usePageTitle('Department Members');
  const toast = useToast();
  const { departments, users, ready: dataReady, refresh } = useData();

  const dept = useMemo(() => (user ? departments.find((d) => d.id === user.departmentId) : null), [user, departments]);
  const members = useMemo(() => (user ? scopeUsers(user, users) : []), [user, users]);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ id: '', name: '', email: '', position: '', role: 'faculty' as Role, password: '' });

  if (!ready || !user || !dataReady) return null;

  const heads = members.filter((m) => m.role === 'head');
  const secretaries = members.filter((m) => m.role === 'secretary');
  const faculty = members.filter((m) => m.role === 'faculty');

  function openAdd() {
    setForm({ id: '', name: '', email: '', position: '', role: 'faculty', password: '' });
    setModalOpen(true);
  }
  function openEdit(m: User) {
    setForm({ id: m.id, name: m.name, email: m.email, position: m.position || '', role: m.role, password: '' });
    setModalOpen(true);
  }
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.role === 'secretary' && secretaries.filter((s) => s.id !== form.id).length >= MAX_SECRETARIES) {
      toast(`A department may have at most ${MAX_SECRETARIES} secretaries.`, 'error');
      return;
    }
    const editing = !!form.id;
    const res = await fetch('/api/head/members', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        editing
          ? { id: form.id, name: form.name.trim(), position: form.position.trim(), role: form.role, ...(form.password ? { password: form.password } : {}) }
          : { name: form.name.trim(), email: form.email.trim().toLowerCase(), position: form.position.trim(), role: form.role, ...(form.password ? { password: form.password } : {}) },
      ),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error || 'Could not save member', 'error');
    void logAudit(editing ? 'member_updated' : 'member_added', `${form.name.trim()} (${form.role}) in ${dept?.short}`);
    toast(`Member ${editing ? 'updated' : 'added'} to ${dept?.short}.`, 'success');
    setModalOpen(false);
    await refresh();
  }

  function Group({ title, icon, list, cap }: { title: string; icon: string; list: User[]; cap?: string }) {
    return (
      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
        <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm">
          <span className="material-symbols-outlined text-primary">{icon}</span> {title}
          <span className="font-caption text-caption text-on-surface-variant">({list.length}{cap ? ` / ${cap}` : ''})</span>
        </h3>
        <div className="space-y-sm">
          {list.length === 0 ? (
            <p className="text-on-surface-variant italic font-body-sm">None yet.</p>
          ) : (
            list.map((m) => (
              <div key={m.id} className="flex items-center gap-sm p-sm rounded-lg hover:bg-surface-container-low">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">{initials(m.name)}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-body-sm font-semibold truncate">{m.name}</p>
                  <p className="font-caption text-caption text-on-surface-variant truncate">{m.position || m.email}</p>
                </div>
                {m.role !== 'head' ? (
                  <button onClick={() => openEdit(m)} className="text-secondary hover:text-primary"><span className="material-symbols-outlined text-[20px]">edit</span></button>
                ) : (
                  <span className="pill pill-locked">Head</span>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    );
  }

  const inputCls = 'w-full px-md py-sm bg-surface-container-low border-2 border-transparent focus:border-primary rounded-lg';

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-md mb-lg">
        <div>
          <h1 className="font-h1 text-h1">Department Members</h1>
          <p className="font-body-md text-on-surface-variant">
            {dept ? `${dept.name} (${dept.short})` : ''} — manage your secretaries and faculty. A department has one head and up to {MAX_SECRETARIES} secretaries.
          </p>
        </div>
        <button onClick={openAdd} className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md flex items-center gap-xs">
          <span className="material-symbols-outlined text-[18px]">person_add</span> Add Member
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        <Group title="Head" icon="stars" list={heads} />
        <Group title="Secretaries" icon="edit_note" list={secretaries} cap={String(MAX_SECRETARIES)} />
        <Group title="Faculty" icon="school" list={faculty} />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={form.id ? 'Edit Member' : 'Add Member'}>
        <form onSubmit={onSubmit} className="space-y-md">
          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Full Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Email</label>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Position</label>
            <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-md">
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className={inputCls}>
                <option value="faculty">Faculty</option>
                <option value="secretary">Secretary</option>
              </select>
            </div>
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Temp. Password</label>
              <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} placeholder="Leave blank to keep" />
            </div>
          </div>
          <div className="flex justify-end gap-sm pt-md border-t border-outline-variant">
            <button type="button" onClick={() => setModalOpen(false)} className="px-md py-sm rounded-lg border border-outline-variant">Cancel</button>
            <button type="submit" className="px-md py-sm rounded-lg bg-primary text-on-primary shadow-primary-md flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">save</span> Save
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
