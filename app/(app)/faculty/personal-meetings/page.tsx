'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { useData } from '@/components/DataProvider';
import { savePersonalMeeting, deletePersonalMeeting, logAudit } from '@/lib/db';
import { scopePersonalMeetings } from '@/lib/scope';
import { fmtDate } from '@/lib/utils';
import type { PersonalMeeting } from '@/lib/types';

const emptyForm = { id: '', title: '', date: '', time: '', type: 'Adviser-Advisee', attendees: '', notes: '' };

function Inner() {
  const { user, ready } = useRequireRole('faculty');
  usePageTitle('Personal Meetings');
  const toast = useToast();
  const params = useSearchParams();

  const { personalMeetings, ready: dataReady, refresh } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [openedDeepLink, setOpenedDeepLink] = useState(false);
  const editing = !!form.id;

  const items = useMemo(() => {
    if (!user) return [];
    return scopePersonalMeetings(user, personalMeetings).sort(
      (a, b) =>
        new Date(`${b.date}T${b.time || '00:00'}`).getTime() - new Date(`${a.date}T${a.time || '00:00'}`).getTime(),
    );
  }, [user, personalMeetings]);

  // Deep link ?id=
  if (user && dataReady && !openedDeepLink) {
    const id = params.get('id');
    if (id) {
      const p = items.find((x) => x.id === id);
      if (p && p.userId === user.id) {
        setForm({ id: p.id, title: p.title, date: p.date, time: p.time || '', type: p.type, attendees: p.attendees || '', notes: p.notes || '' });
        setModalOpen(true);
      }
    }
    setOpenedDeepLink(true);
  }

  if (!ready || !user || !dataReady) return null;

  function openAdd() {
    setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10) });
    setModalOpen(true);
  }
  function openEdit(p: PersonalMeeting) {
    setForm({ id: p.id, title: p.title, date: p.date, time: p.time || '', type: p.type, attendees: p.attendees || '', notes: p.notes || '' });
    setModalOpen(true);
  }
  async function del(id: string) {
    if (!window.confirm('Delete this personal meeting?')) return;
    const p = items.find((x) => x.id === id);
    if (!p || p.userId !== user!.id) return;
    try {
      await deletePersonalMeeting(id);
    } catch {
      return toast('Could not delete', 'error');
    }
    void logAudit('personal_meeting_deleted', p.title);
    toast('Personal meeting removed.', 'success');
    setModalOpen(false);
    await refresh();
  }
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await savePersonalMeeting({
        id: form.id || undefined,
        userId: user!.id,
        title: form.title.trim(),
        date: form.date,
        time: form.time,
        type: form.type,
        attendees: form.attendees.trim(),
        notes: form.notes.trim(),
      });
    } catch {
      return toast('Could not save personal meeting', 'error');
    }
    void logAudit(form.id ? 'personal_meeting_updated' : 'personal_meeting_created', form.title.trim());
    toast(`Personal meeting ${form.id ? 'updated' : 'logged'}.`, 'success');
    setModalOpen(false);
    await refresh();
  }

  const inputCls = 'w-full px-md py-sm bg-surface-container-low border-2 border-transparent focus:border-primary rounded-lg';

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-md mb-lg no-print">
        <div>
          <h1 className="font-h1 text-h1 flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary text-[36px]">event_available</span> My Personal Meetings
          </h1>
          <p className="font-body-md text-on-surface-variant">
            Log advising, consultations, or any private meeting that isn&apos;t part of an institutional agenda. Visible to you only.
          </p>
        </div>
        <div className="flex gap-sm">
          <button onClick={() => window.print()} className="border border-outline-variant px-md py-sm rounded-lg flex items-center gap-sm hover:bg-surface-container-low">
            <span className="material-symbols-outlined text-[18px]">print</span> Print / Export
          </button>
          <button onClick={openAdd} className="bg-primary text-on-primary rounded-lg px-md py-sm font-label-caps text-label-caps shadow-primary-md hover:opacity-90 flex items-center gap-sm">
            <span className="material-symbols-outlined text-[18px]">add</span> New Personal Meeting
          </button>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="text-center py-xl bg-surface-container-low border border-dashed border-outline-variant rounded-xl no-print">
          <span className="material-symbols-outlined text-[64px] text-on-surface-variant">event_busy</span>
          <p className="font-body-md text-on-surface-variant mt-sm">
            No personal meetings logged yet. Click <strong>New Personal Meeting</strong> to add one.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md no-print">
        {items.map((p) => (
          <div key={p.id} className="folder-card">
            <div className="flex items-start justify-between mb-md">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <span className="material-symbols-outlined">event_note</span>
              </div>
              <span className="pill pill-regular">{p.type || 'Personal'}</span>
            </div>
            <h3 className="font-h3 text-h3 mb-xs">{p.title}</h3>
            <p className="font-caption text-caption text-on-surface-variant mb-sm">
              {p.date} {p.time ? `· ${p.time}` : ''}
            </p>
            {p.attendees ? (
              <p className="font-body-sm mb-sm">
                <span className="material-symbols-outlined text-[14px] align-middle text-on-surface-variant">group</span> {p.attendees}
              </p>
            ) : null}
            {p.notes ? <p className="font-body-sm text-on-surface line-clamp-4 mb-md whitespace-pre-wrap">{p.notes}</p> : null}
            <div className="flex gap-xs pt-md border-t border-outline-variant">
              <button onClick={() => openEdit(p)} className="flex-1 border border-outline-variant px-sm py-xs rounded-lg hover:bg-surface-container text-body-sm flex items-center justify-center gap-xs">
                <span className="material-symbols-outlined text-[16px]">edit</span> Edit
              </button>
              <button onClick={() => del(p.id)} className="border border-outline-variant px-sm py-xs rounded-lg hover:bg-error/10 hover:text-error text-body-sm flex items-center justify-center gap-xs">
                <span className="material-symbols-outlined text-[16px]">delete</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Print export */}
      <div className="hidden print:block ched-doc mt-lg">
        <div className="text-center border-b-2 border-primary pb-md mb-lg">
          <h2 className="font-h2 text-h2 text-primary font-bold">Personal Meeting Log</h2>
          <p className="font-body-md">Owner: {user.name}</p>
          <p className="font-caption text-on-surface-variant">Generated on {fmtDate(Date.now(), true)}</p>
        </div>
        <div>
          {items.length === 0 ? (
            <p className="italic">No personal meetings logged.</p>
          ) : (
            items.map((p) => (
              <div key={p.id} className="mb-md pb-md border-b border-outline-variant">
                <h3 className="font-h3 text-h3">{p.title}</h3>
                <p className="font-caption text-caption text-on-surface-variant">
                  {p.date} {p.time || ''} · {p.type || 'Personal'}
                </p>
                {p.attendees ? (
                  <p className="mt-xs">
                    <strong>Attendees:</strong> {p.attendees}
                  </p>
                ) : null}
                {p.notes ? <p className="mt-xs whitespace-pre-wrap">{p.notes}</p> : null}
              </div>
            ))
          )}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Personal Meeting' : 'New Personal Meeting'} maxWidth="max-w-[640px]">
        <form onSubmit={onSubmit} className="space-y-md">
          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Meeting Title</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="Adviser-Advisee Sync" />
          </div>
          <div className="grid grid-cols-2 gap-md">
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Date</label>
              <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Time</label>
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputCls}>
              {['Adviser-Advisee', 'Faculty Consultation', 'Student One-on-One', 'Committee Sync', 'External Engagement', 'Other'].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Attendees</label>
            <input value={form.attendees} onChange={(e) => setForm({ ...form, attendees: e.target.value })} className={inputCls} placeholder="Names or roles, separated by commas" />
          </div>
          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Discussion Notes</label>
            <textarea rows={5} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} placeholder="Topics discussed, decisions, follow-ups..." />
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

export default function FacultyPersonalMeetings() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
