'use client';

import { useState } from 'react';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { useData } from '@/components/DataProvider';
import { logAudit } from '@/lib/db';
import { initials } from '@/lib/utils';
import type { Role } from '@/lib/types';

const emptyForm = {
  id: '',
  name: '',
  email: '',
  position: '',
  role: 'faculty' as Role,
  departmentId: '',
  password: '',
  active: true,
};

export default function AdminUsers() {
  const { user, ready } = useRequireRole('admin');
  usePageTitle('User Management');
  const toast = useToast();

  const { departments, users: allUsers, ready: dataReady, refresh } = useData();

  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const editing = !!form.id;

  if (!ready || !user || !dataReady) return null;

  const counts = { admin: 0, head: 0, secretary: 0, faculty: 0 } as Record<string, number>;
  allUsers.forEach((u) => {
    if (counts[u.role] != null) counts[u.role]++;
  });

  const list = allUsers.filter((u) => {
    if (search && !(`${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()))) return false;
    if (filterRole && u.role !== filterRole) return false;
    if (filterDept && u.departmentId !== filterDept) return false;
    if (filterStatus === 'active' && u.active === false) return false;
    if (filterStatus === 'inactive' && u.active !== false) return false;
    return true;
  });

  function openAdd() {
    setForm({ ...emptyForm, departmentId: departments[0]?.id || '' });
    setModalOpen(true);
  }
  function openEdit(id: string) {
    const u = allUsers.find((x) => x.id === id);
    if (!u) return;
    setForm({
      id: u.id,
      name: u.name,
      email: u.email,
      position: u.position || '',
      role: u.role,
      departmentId: u.departmentId,
      password: '',
      active: u.active !== false,
    });
    setModalOpen(true);
  }
  async function toggleActive(id: string) {
    const u = allUsers.find((x) => x.id === id);
    if (!u) return;
    const next = u.active === false;
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, active: next }),
    });
    if (!res.ok) return toast('Could not update status', 'error');
    void logAudit('user_status_changed', `${u.name} -> ${next ? 'Active' : 'Inactive'}`);
    toast(`${u.name} ${next ? 'reactivated' : 'deactivated'}`, 'success');
    await refresh();
  }
  async function sendReset(email: string) {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(`Could not send reset email: ${data.error || res.status}`, 'error');
    if (data.sent) {
      void logAudit('password_reset_sent', email);
      toast(`Password-reset email sent to ${email}.`, 'success');
    } else {
      toast(`No account is registered under ${email}.`, 'info');
    }
  }

  async function deleteUser(id: string) {
    const u = allUsers.find((x) => x.id === id);
    if (!u || !window.confirm(`Delete user "${u.name}"? This cannot be undone.`)) return;
    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) return toast('Could not delete user', 'error');
    void logAudit('user_deleted', u.name);
    toast('User deleted', 'success');
    await refresh();
  }
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const editingUser = form.id ? allUsers.find((x) => x.id === form.id) : null;
    const payload = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      position: form.position.trim(),
      role: form.role,
      departmentId: form.departmentId,
      active: form.active,
      ...(form.password ? { password: form.password } : {}),
    };
    let res: Response;
    if (editingUser) {
      res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: form.id, ...payload }),
      });
    } else {
      res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, password: form.password || 'changeme123' }),
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error || 'Could not save user', 'error');
    void logAudit(editingUser ? 'user_updated' : 'user_created', payload.name);
    toast(`User ${editingUser ? 'updated' : 'added'}`, 'success');
    setModalOpen(false);
    await refresh();
  }

  const roleCards = [
    { label: 'Administrators', icon: 'admin_panel_settings', value: counts.admin, tone: 'primary' },
    { label: 'Heads / Deans', icon: 'stars', value: counts.head, tone: 'primary' },
    { label: 'Secretaries', icon: 'edit_note', value: counts.secretary, tone: 'tertiary' },
    { label: 'Faculty', icon: 'school', value: counts.faculty, tone: 'tertiary' },
  ];
  const inputCls =
    'w-full px-md py-sm bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0 rounded-lg';

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-md mb-lg">
        <div>
          <h1 className="font-h1 text-h1">User Management</h1>
          <p className="font-body-md text-on-surface-variant">Unified view across every role and department in ZPPSU.</p>
        </div>
        <button onClick={openAdd} className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md hover:opacity-90 flex items-center gap-xs">
          <span className="material-symbols-outlined text-[18px]">person_add</span> Add User
        </button>
      </header>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md mb-md flex flex-col md:flex-row gap-sm">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            type="text"
            placeholder="Search by name or email"
            className="w-full pl-xl pr-md py-sm bg-surface-container border-transparent focus:border-primary focus:ring-0 rounded-lg"
          />
        </div>
        <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="bg-surface-container border-transparent focus:border-primary focus:ring-0 rounded-lg py-sm px-md">
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="head">Head / Dean</option>
          <option value="secretary">Secretary</option>
          <option value="faculty">Faculty</option>
        </select>
        <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="bg-surface-container border-transparent focus:border-primary focus:ring-0 rounded-lg py-sm px-md">
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.short}
            </option>
          ))}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-surface-container border-transparent focus:border-primary focus:ring-0 rounded-lg py-sm px-md">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-md mb-md">
        {roleCards.map((c) => (
          <div key={c.label} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex items-center gap-md">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.tone === 'primary' ? 'bg-primary-fixed text-primary' : 'bg-tertiary-fixed text-on-tertiary-fixed-variant'}`}>
              <span className="material-symbols-outlined">{c.icon}</span>
            </div>
            <div>
              <p className="font-h2 text-h2 font-bold">{c.value}</p>
              <p className="font-caption text-caption text-on-surface-variant">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Name', 'Role', 'Department', 'Position', 'Status'].map((h) => (
                  <th key={h} className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">
                    {h}
                  </th>
                ))}
                <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-xl text-center text-on-surface-variant">
                    No users match the current filters.
                  </td>
                </tr>
              ) : (
                list.map((u) => {
                  const dept = departments.find((d) => d.id === u.departmentId);
                  return (
                    <tr key={u.id} className="border-b border-outline-variant hover:bg-surface-container-low">
                      <td className="py-sm px-md">
                        <div className="flex items-center gap-sm">
                          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                            {initials(u.name)}
                          </div>
                          <div>
                            <div className="font-semibold">{u.name}</div>
                            <div className="font-caption text-on-surface-variant">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-sm px-md">
                        <span className="capitalize px-sm py-xs rounded-full text-caption font-semibold bg-surface-container">{u.role}</span>
                      </td>
                      <td className="py-sm px-md">{dept ? dept.short : '—'}</td>
                      <td className="py-sm px-md text-on-surface-variant">{u.position || ''}</td>
                      <td className="py-sm px-md">
                        <span className={`pill ${u.active !== false ? 'pill-done' : 'pill-overdue'}`}>
                          {u.active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-sm px-md text-right whitespace-nowrap">
                        <button onClick={() => openEdit(u.id)} className="text-secondary hover:text-primary" title="Edit">
                          <span className="material-symbols-outlined text-[20px]">edit</span>
                        </button>
                        <button onClick={() => sendReset(u.email)} className="text-secondary hover:text-primary" title="Send password-reset email">
                          <span className="material-symbols-outlined text-[20px]">mail</span>
                        </button>
                        <button onClick={() => toggleActive(u.id)} className="text-secondary hover:text-primary" title="Toggle active">
                          <span className="material-symbols-outlined text-[20px]">{u.active !== false ? 'block' : 'check_circle'}</span>
                        </button>
                        <button onClick={() => deleteUser(u.id)} className="text-secondary hover:text-error" title="Delete">
                          <span className="material-symbols-outlined text-[20px]">delete</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit User' : 'Add User'}>
        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-md">
          <div className="md:col-span-2">
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
          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className={inputCls}>
              <option value="faculty">Faculty</option>
              <option value="secretary">Secretary</option>
              <option value="head">Head / President</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Department</label>
            <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className={inputCls}>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.short} - {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Password</label>
            <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} placeholder="Leave blank to keep current" />
          </div>
          <div>
            <label className="flex items-center gap-xs mt-md">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="rounded text-primary" />
              <span className="font-body-sm">Active account</span>
            </label>
          </div>
          <div className="md:col-span-2 flex justify-end gap-sm pt-md border-t border-outline-variant">
            <button type="button" onClick={() => setModalOpen(false)} className="px-md py-sm rounded-lg border border-outline-variant">
              Cancel
            </button>
            <button type="submit" className="px-md py-sm rounded-lg bg-primary text-on-primary shadow-primary-md flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">save</span> Save
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
