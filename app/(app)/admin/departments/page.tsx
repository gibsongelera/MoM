'use client';

import { useState } from 'react';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { useData } from '@/components/DataProvider';
import { saveDepartment, deleteDepartment, logAudit } from '@/lib/db';
import type { DepartmentType } from '@/lib/types';

const emptyForm = { id: '', name: '', short: '', type: 'college' as DepartmentType, officeLocation: '', headId: '' };

export default function AdminDepartments() {
  const { user, ready } = useRequireRole('admin');
  usePageTitle('Departments & Offices');
  const toast = useToast();
  const { departments: depts, users, meetings, ready: dataReady, refresh } = useData();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const editing = !!form.id;

  if (!ready || !user || !dataReady) return null;

  const headOptions = users.filter((u) => ['head', 'admin'].includes(u.role));

  function openAdd() {
    setForm(emptyForm);
    setModalOpen(true);
  }
  function openEdit(id: string) {
    const d = depts.find((x) => x.id === id);
    if (!d) return;
    setForm({
      id: d.id,
      name: d.name,
      short: d.short,
      type: d.type,
      officeLocation: d.officeLocation || '',
      headId: d.headId || '',
    });
    setModalOpen(true);
  }
  async function deleteDept(id: string) {
    const d = depts.find((x) => x.id === id);
    if (!d || !window.confirm(`Delete "${d.name}"?`)) return;
    try {
      await deleteDepartment(id);
    } catch {
      return toast('Could not delete (department may still have members/meetings).', 'error');
    }
    void logAudit('department_deleted', d.name);
    toast('Department deleted', 'success');
    await refresh();
  }
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await saveDepartment({
        id: form.id || undefined,
        name: form.name.trim(),
        short: form.short.trim(),
        type: form.type,
        officeLocation: form.officeLocation.trim(),
        headId: form.headId,
      });
    } catch {
      return toast('Could not save department', 'error');
    }
    void logAudit(form.id ? 'department_updated' : 'department_created', form.name.trim());
    toast(`Department ${form.id ? 'updated' : 'added'}`, 'success');
    setModalOpen(false);
    await refresh();
  }

  const inputCls =
    'w-full px-md py-sm bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0 rounded-lg';

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-md mb-lg">
        <div>
          <h1 className="font-h1 text-h1">Departments &amp; Offices</h1>
          <p className="font-body-md text-on-surface-variant">Manage institutional units, colleges, and administrative offices.</p>
        </div>
        <button onClick={openAdd} className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md hover:opacity-90 flex items-center gap-xs">
          <span className="material-symbols-outlined text-[18px]">add_business</span> Add Department
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
        {depts.map((d) => {
          const head = users.find((u) => u.id === d.headId);
          const memberCount = users.filter((u) => u.departmentId === d.id).length;
          const meetingCount = meetings.filter((m) => m.departmentId === d.id).length;
          const icon = d.type === 'college' ? 'school' : d.type === 'office' ? 'corporate_fare' : 'apartment';
          return (
            <div key={d.id} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md relative overflow-hidden">
              <div className="absolute top-0 right-0 w-1 h-full bg-primary" />
              <div className="flex items-start justify-between mb-md">
                <div className="w-12 h-12 rounded-lg bg-primary text-on-primary flex items-center justify-center shadow-primary-md">
                  <span className="material-symbols-outlined">{icon}</span>
                </div>
                <div className="flex gap-xs">
                  <button onClick={() => openEdit(d.id)} className="text-secondary hover:text-primary">
                    <span className="material-symbols-outlined text-[20px]">edit</span>
                  </button>
                  <button onClick={() => deleteDept(d.id)} className="text-secondary hover:text-error">
                    <span className="material-symbols-outlined text-[20px]">delete</span>
                  </button>
                </div>
              </div>
              <h3 className="font-h3 text-h3 text-on-surface mb-xs">{d.short}</h3>
              <p className="font-body-sm text-on-surface-variant mb-sm">{d.name}</p>
              <div className="space-y-xs text-body-sm">
                <p className="flex items-center gap-xs">
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant">place</span>
                  {d.officeLocation || '—'}
                </p>
                <p className="flex items-center gap-xs">
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant">person</span>
                  {head ? head.name : <em className="text-on-surface-variant">Head unassigned</em>}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-sm mt-md pt-md border-t border-outline-variant">
                <div>
                  <p className="font-h3 text-h3 text-primary">{memberCount}</p>
                  <p className="font-caption text-caption text-on-surface-variant">Members</p>
                </div>
                <div>
                  <p className="font-h3 text-h3 text-primary">{meetingCount}</p>
                  <p className="font-caption text-caption text-on-surface-variant">Meetings</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Department' : 'Add Department'} maxWidth="max-w-[520px]">
        <form onSubmit={onSubmit} className="space-y-md">
          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Full Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-md">
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Short Code</label>
              <input required value={form.short} onChange={(e) => setForm({ ...form, short: e.target.value })} className={inputCls} placeholder="CICS" />
            </div>
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DepartmentType })} className={inputCls}>
                <option value="college">College</option>
                <option value="office">Office</option>
                <option value="department">Department</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Office Location</label>
            <input value={form.officeLocation} onChange={(e) => setForm({ ...form, officeLocation: e.target.value })} className={inputCls} placeholder="Bldg A, 4F" />
          </div>
          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Head of Unit</label>
            <select value={form.headId} onChange={(e) => setForm({ ...form, headId: e.target.value })} className={inputCls}>
              <option value="">— Not assigned —</option>
              {headOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-sm pt-md border-t border-outline-variant">
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
