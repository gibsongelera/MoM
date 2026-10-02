'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { useData } from '@/components/DataProvider';
import { saveMeeting, deleteMeeting, notifyUser, logAudit } from '@/lib/db';
import { scopeMeetings, scopeUsers } from '@/lib/scope';
import { docTitleFor } from '@/lib/summarizer';
import { fmtDate } from '@/lib/utils';
import type { Meeting, MeetingType } from '@/lib/types';

const TYPE_LABELS: Record<string, string> = { regular: 'Regular', capstone: 'Capstone', research: 'Research' };

interface Form {
  id: string;
  title: string;
  date: string;
  durationMin: number;
  venue: string;
  chairId: string;
  language: string;
  agenda: string;
  type: MeetingType;
  subType: string;
  projectTitle: string;
  chairpersonId: string;
  adviserId: string;
  participantIds: string[];
  panelMemberIds: string[];
}

function Inner() {
  const { user, ready } = useRequireRole('secretary');
  usePageTitle('Meeting Schedule');
  const toast = useToast();
  const params = useSearchParams();

  const { users, meetings: allMeetingsRaw, minutes: allMinutes, settings, taxonomy, ready: dataReady, refresh } = useData();

  const candidates = useMemo(() => (user ? scopeUsers(user, users) : []), [user, users]);
  const chairOptions = candidates.filter((u) => ['head', 'admin'].includes(u.role));
  const facultyOptions = candidates.filter((u) => ['faculty', 'head', 'admin'].includes(u.role));

  const [activeFilter, setActiveFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [openedDeep, setOpenedDeep] = useState(false);

  const blankForm = (): Form => ({
    id: '',
    title: '',
    date: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    durationMin: 60,
    venue: '',
    chairId: chairOptions[0]?.id || '',
    language: settings.defaultLanguage || 'en-US',
    agenda: '',
    type: 'regular',
    subType: '',
    projectTitle: '',
    chairpersonId: chairOptions[0]?.id || '',
    adviserId: facultyOptions[0]?.id || '',
    participantIds: [],
    panelMemberIds: [],
  });
  const [form, setForm] = useState<Form>(blankForm);
  const editing = !!form.id;

  const meetings = useMemo(
    () =>
      (user ? scopeMeetings(user, allMeetingsRaw) : [])
        .filter((m) => activeFilter === 'all' || (m.meetingType || 'regular') === activeFilter)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [user, activeFilter, allMeetingsRaw],
  );

  function openFromMeeting(m: Meeting) {
    setForm({
      id: m.id,
      title: m.title,
      date: m.date,
      durationMin: m.durationMin || 60,
      venue: m.venue || '',
      chairId: m.chairId || chairOptions[0]?.id || '',
      language: m.language || 'en-US',
      agenda: (m.agenda || []).join('\n'),
      type: (m.meetingType as MeetingType) || 'regular',
      subType: m.subType || '',
      projectTitle: m.projectTitle || '',
      chairpersonId: m.chairpersonId || chairOptions[0]?.id || '',
      adviserId: m.adviserId || facultyOptions[0]?.id || '',
      participantIds: m.participantIds || [],
      panelMemberIds: m.panelMemberIds || [],
    });
    setModalOpen(true);
  }

  if (user && dataReady && !openedDeep) {
    const id = params.get('id');
    if (id) {
      const t = allMeetingsRaw.find((x) => x.id === id);
      if (t) openFromMeeting(t);
    }
    setOpenedDeep(true);
  }

  if (!ready || !user || !dataReady) return null;

  function toggleId(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const existing = form.id ? allMeetingsRaw.find((x) => x.id === form.id) : null;
    const t = form.type;
    let saved: Meeting;
    try {
      saved = await saveMeeting({
        id: form.id || undefined,
        title: form.title.trim(),
        date: form.date,
        durationMin: form.durationMin || 60,
        venue: form.venue.trim(),
        chairId: form.chairId,
        secretaryId: user!.id,
        language: form.language,
        agenda: form.agenda.split('\n').map((s) => s.trim()).filter(Boolean),
        departmentId: existing?.departmentId || user!.departmentId,
        participantIds: form.participantIds,
        status: existing?.status || 'scheduled',
        aiProcessed: existing?.aiProcessed || false,
        meetingType: t,
        subType: t === 'regular' ? '' : form.subType,
        projectTitle: t === 'regular' ? '' : form.projectTitle.trim(),
        chairpersonId: t === 'capstone' ? form.chairpersonId : '',
        panelMemberIds: form.panelMemberIds,
        adviserId: t === 'regular' ? '' : form.adviserId,
      });
    } catch {
      return toast('Could not save meeting', 'error');
    }
    void logAudit(existing ? 'meeting_updated' : 'meeting_created', `${TYPE_LABELS[t]}${saved.subType ? ` (${saved.subType})` : ''}: ${saved.title}`);
    if (!existing) {
      // Send invitations to participants (skip the organizing secretary).
      form.participantIds.filter((id) => id !== user!.id).forEach((id) =>
        void notifyUser(id, 'approval', 'Meeting invitation', `${saved.title} on ${fmtDate(saved.date, true)} — please RSVP from My Meetings.`),
      );
    }
    toast(`${TYPE_LABELS[t]} meeting ${existing ? 'updated' : 'scheduled'}.`, 'success');
    setModalOpen(false);
    await refresh();
  }

  async function del() {
    if (!form.id || !window.confirm('Delete this meeting?')) return;
    try {
      await deleteMeeting(form.id);
    } catch {
      return toast('Could not delete meeting', 'error');
    }
    void logAudit('meeting_deleted', form.id);
    toast('Meeting deleted', 'success');
    setModalOpen(false);
    await refresh();
  }

  const docPreview = docTitleFor({ title: form.title, meetingType: form.type, subType: form.subType, projectTitle: form.projectTitle } as Meeting);
  const subOptions = form.type === 'regular' ? [] : taxonomy[form.type as 'capstone' | 'research'] || [];
  const inputCls = 'w-full px-md py-sm bg-surface-container-low border-2 border-transparent focus:border-primary rounded-lg';

  const filterChips = [
    { f: 'all', cls: 'pill-pending', label: 'All' },
    { f: 'regular', cls: 'pill-regular', label: 'Regular' },
    { f: 'capstone', cls: 'pill-capstone', label: 'Capstone' },
    { f: 'research', cls: 'pill-research', label: 'Research' },
  ];

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-md mb-lg">
        <div>
          <h1 className="font-h1 text-h1">Meeting Schedule</h1>
          <p className="font-body-md text-on-surface-variant">Plan upcoming meetings — including Capstone defenses and Research sessions — and manage past records.</p>
        </div>
        <div className="flex gap-sm">
          <Link href="/secretary/calendar" className="border border-outline-variant px-md py-sm rounded-lg flex items-center gap-sm hover:bg-surface-container-low">
            <span className="material-symbols-outlined text-[18px]">calendar_month</span> Calendar
          </Link>
          <button onClick={() => { setForm(blankForm()); setModalOpen(true); }} className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">add</span> New Meeting
          </button>
        </div>
      </header>

      <div className="flex gap-xs flex-wrap mb-md">
        {filterChips.map((c) => (
          <button key={c.f} onClick={() => setActiveFilter(c.f)} className={`pill ${c.cls} hover:opacity-80 ${activeFilter === c.f ? 'ring-2 ring-primary' : ''}`}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
        {meetings.length === 0 ? (
          <p className="col-span-full text-on-surface-variant text-center py-xl">No meetings yet. Create one above.</p>
        ) : (
          meetings.map((m) => {
            const chair = candidates.find((u) => u.id === m.chairId);
            const pillCls = m.status === 'approved' ? 'pill-done' : m.status === 'pending_approval' ? 'pill-progress' : 'pill-pending';
            const min = allMinutes.find((mn) => mn.meetingId === m.id);
            const locked = min && min.lockedAt;
            const type = m.meetingType || 'regular';
            return (
              <div key={m.id} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md hover:shadow-primary-md transition-shadow">
                <div className="flex items-start justify-between mb-md">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <span className="material-symbols-outlined">{type === 'capstone' ? 'school' : type === 'research' ? 'science' : 'event'}</span>
                  </div>
                  <div className="flex flex-col gap-xs items-end">
                    <span className={`pill pill-${type}`}>{TYPE_LABELS[type]}{m.subType ? ` · ${m.subType}` : ''}</span>
                    <span className={`pill ${pillCls}`}>{m.status.replace('_', ' ')}</span>
                    {locked ? <span className="pill pill-locked"><span className="material-symbols-outlined text-[12px]">lock</span> LOCKED</span> : null}
                  </div>
                </div>
                <h3 className="font-h3 text-h3 mb-xs">{m.title}</h3>
                {m.projectTitle ? <p className="font-body-sm text-tertiary mb-sm"><span className="material-symbols-outlined text-[14px] align-middle">school</span> {m.projectTitle}</p> : null}
                <p className="font-caption text-caption text-on-surface-variant mb-sm">{fmtDate(m.date, true)} · {m.durationMin || 60}min</p>
                <p className="font-body-sm flex items-center gap-xs mb-xs"><span className="material-symbols-outlined text-[16px] text-on-surface-variant">place</span>{m.venue || '—'}</p>
                <p className="font-body-sm flex items-center gap-xs mb-md"><span className="material-symbols-outlined text-[16px] text-on-surface-variant">person</span>{chair ? chair.name : '—'}</p>
                <div className="flex gap-xs pt-md border-t border-outline-variant">
                  <button onClick={() => openFromMeeting(m)} className="flex-1 border border-outline-variant px-sm py-xs rounded-lg hover:bg-surface-container text-body-sm flex items-center justify-center gap-xs">
                    <span className="material-symbols-outlined text-[16px]">edit</span> Edit
                  </button>
                  <Link href={`/secretary/live-recording?m=${m.id}`} className="flex-1 bg-primary text-on-primary px-sm py-xs rounded-lg shadow-primary-md text-body-sm flex items-center justify-center gap-xs">
                    <span className="material-symbols-outlined text-[16px]">mic</span> Record
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Meeting' : 'New Meeting'} maxWidth="max-w-[720px]">
        <form onSubmit={onSubmit} className="space-y-md">
          <div className="grid grid-cols-2 gap-md">
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Meeting Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as MeetingType, subType: '' })} className={inputCls}>
                <option value="regular">Regular</option>
                <option value="capstone">Capstone</option>
                <option value="research">Research</option>
              </select>
            </div>
            {form.type !== 'regular' ? (
              <div>
                <label className="block font-label-caps text-label-caps mb-xs">Sub-Type</label>
                <select value={form.subType} onChange={(e) => setForm({ ...form, subType: e.target.value })} className={inputCls}>
                  <option value="">—</option>
                  {subOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ) : null}
          </div>

          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Title</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="e.g. Faculty Senate Monthly Sync" />
          </div>

          {form.type !== 'regular' ? (
            <div className="space-y-md p-md rounded-lg border border-tertiary-container/40 bg-tertiary-fixed/20">
              <p className="font-label-caps text-label-caps text-tertiary flex items-center gap-xs"><span className="material-symbols-outlined text-[16px]">school</span> Project Details</p>
              <div>
                <label className="block font-label-caps text-label-caps mb-xs">Project Title</label>
                <input value={form.projectTitle} onChange={(e) => setForm({ ...form, projectTitle: e.target.value })} className="w-full px-md py-sm bg-surface-container-lowest border-2 border-transparent focus:border-primary rounded-lg" placeholder="e.g. SmartMin AI: Local-First Institutional Governance Platform" />
              </div>
              {form.type === 'capstone' ? (
                <div className="space-y-md">
                  <div className="grid grid-cols-2 gap-md">
                    <div>
                      <label className="block font-label-caps text-label-caps mb-xs">Chairperson</label>
                      <select value={form.chairpersonId} onChange={(e) => setForm({ ...form, chairpersonId: e.target.value })} className="w-full px-md py-sm bg-surface-container-lowest border-2 border-transparent focus:border-primary rounded-lg">
                        {chairOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block font-label-caps text-label-caps mb-xs">Adviser</label>
                      <select value={form.adviserId} onChange={(e) => setForm({ ...form, adviserId: e.target.value })} className="w-full px-md py-sm bg-surface-container-lowest border-2 border-transparent focus:border-primary rounded-lg">
                        {facultyOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block font-label-caps text-label-caps mb-xs">Panel Members</label>
                    <div className="grid grid-cols-2 gap-xs bg-surface-container-lowest p-sm rounded-lg max-h-[140px] overflow-y-auto">
                      {facultyOptions.map((u) => (
                        <label key={u.id} className="flex items-center gap-xs">
                          <input type="checkbox" checked={form.panelMemberIds.includes(u.id)} onChange={() => setForm({ ...form, panelMemberIds: toggleId(form.panelMemberIds, u.id) })} className="rounded text-primary" />
                          <span className="font-body-sm">{u.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block font-label-caps text-label-caps mb-xs">Adviser / Lead Researcher</label>
                  <select value={form.adviserId} onChange={(e) => setForm({ ...form, adviserId: e.target.value })} className="w-full px-md py-sm bg-surface-container-lowest border-2 border-transparent focus:border-primary rounded-lg">
                    {facultyOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-md">
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Date &amp; Time</label>
              <input type="datetime-local" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Duration (minutes)</label>
              <input type="number" min={15} step={15} value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: parseInt(e.target.value, 10) || 60 })} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Venue</label>
            <input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} className={inputCls} placeholder="Conference Room A" />
          </div>
          <div className="grid grid-cols-2 gap-md">
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Presiding Officer</label>
              <select value={form.chairId} onChange={(e) => setForm({ ...form, chairId: e.target.value })} className={inputCls}>
                {chairOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Language</label>
              <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} className={inputCls}>
                <option value="en-US">English</option>
                <option value="tl-PH">Tagalog</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Agenda (one per line)</label>
            <textarea rows={3} value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block font-label-caps text-label-caps mb-xs">Participants</label>
            <div className="grid grid-cols-2 gap-xs bg-surface-container-low p-sm rounded-lg max-h-[160px] overflow-y-auto">
              {candidates.map((u) => (
                <label key={u.id} className="flex items-center gap-xs">
                  <input type="checkbox" checked={form.participantIds.includes(u.id)} onChange={() => setForm({ ...form, participantIds: toggleId(form.participantIds, u.id) })} className="rounded text-primary" />
                  <span className="font-body-sm">{u.name} <span className="font-caption text-on-surface-variant">({u.role})</span></span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-surface-container-low border border-outline-variant rounded-lg p-sm flex items-start gap-sm">
            <span className="material-symbols-outlined text-primary">description</span>
            <div>
              <p className="font-label-caps text-label-caps text-on-surface-variant">Document title preview</p>
              <p className="font-body-md font-semibold">{docPreview}</p>
              <p className="font-caption text-caption text-on-surface-variant mt-xs">Used as the default heading and filename base for this meeting&apos;s minutes.</p>
            </div>
          </div>

          <div className="flex justify-between pt-md border-t border-outline-variant">
            {editing ? (
              <button type="button" onClick={del} className="text-error hover:bg-error/10 px-md py-sm rounded-lg flex items-center gap-xs">
                <span className="material-symbols-outlined text-[18px]">delete</span> Delete
              </button>
            ) : <span />}
            <div className="flex gap-sm ml-auto">
              <button type="button" onClick={() => setModalOpen(false)} className="px-md py-sm rounded-lg border border-outline-variant">Cancel</button>
              <button type="submit" className="px-md py-sm rounded-lg bg-primary text-on-primary shadow-primary-md flex items-center gap-xs">
                <span className="material-symbols-outlined text-[18px]">save</span> Save Meeting
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function SecretarySchedule() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
