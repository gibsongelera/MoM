'use client';

import { useState } from 'react';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useData } from '@/components/DataProvider';
import { fmtDate } from '@/lib/utils';

const STATUS_PILL: Record<string, [string, string]> = {
  scheduled: ['pill-pending', 'Scheduled'],
  transcribed: ['pill-progress', 'Transcribed'],
  pending_approval: ['pill-progress', 'Pending Approval'],
  approved: ['pill-done', 'Approved'],
  archived: ['pill-pending', 'Archived'],
};

export default function AdminMeetings() {
  const { user, ready } = useRequireRole('admin');
  usePageTitle('All Meetings');
  const { departments, users, meetings, minutes, ready: dataReady } = useData();

  const [search, setSearch] = useState('');
  const [fd, setFd] = useState('');
  const [ft, setFt] = useState('');
  const [fs, setFs] = useState('');

  if (!ready || !user || !dataReady) return null;

  const list = meetings.filter((m) => {
    if (search && !`${m.title} ${m.venue || ''} ${m.projectTitle || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (fd && m.departmentId !== fd) return false;
    if (ft && (m.meetingType || 'regular') !== ft) return false;
    if (fs && m.status !== fs) return false;
    return true;
  });

  const buckets: Record<string, number> = { scheduled: 0, transcribed: 0, pending_approval: 0, approved: 0, archived: 0 };
  meetings.forEach((m) => {
    buckets[m.status] = (buckets[m.status] || 0) + 1;
  });
  const stats = [
    { label: 'Scheduled', v: buckets.scheduled, icon: 'event' },
    { label: 'Transcribed', v: buckets.transcribed, icon: 'closed_caption' },
    { label: 'Pending Approval', v: buckets.pending_approval, icon: 'pending_actions' },
    { label: 'Approved', v: buckets.approved, icon: 'verified' },
    { label: 'Archived', v: buckets.archived, icon: 'inventory_2' },
  ];

  const selCls = 'bg-surface-container border-transparent focus:border-primary focus:ring-0 rounded-lg py-sm px-md';

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">All Meetings</h1>
        <p className="font-body-md text-on-surface-variant">Institution-wide meeting overview across every department.</p>
      </header>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md mb-md flex flex-col md:flex-row gap-sm">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or venue"
            className="w-full pl-xl pr-md py-sm bg-surface-container border-transparent focus:border-primary focus:ring-0 rounded-lg"
          />
        </div>
        <select value={fd} onChange={(e) => setFd(e.target.value)} className={selCls}>
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.short}
            </option>
          ))}
        </select>
        <select value={ft} onChange={(e) => setFt(e.target.value)} className={selCls}>
          <option value="">All Types</option>
          <option value="regular">Regular</option>
          <option value="capstone">Capstone</option>
          <option value="research">Research</option>
        </select>
        <select value={fs} onChange={(e) => setFs(e.target.value)} className={selCls}>
          <option value="">All Status</option>
          <option value="scheduled">Scheduled</option>
          <option value="transcribed">Transcribed</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-md mb-md">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md text-center">
            <span className="material-symbols-outlined text-primary text-[24px]">{s.icon}</span>
            <p className="font-h2 text-h2 font-bold mt-xs">{s.v}</p>
            <p className="font-caption text-caption text-on-surface-variant">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Title', 'Date', 'Department', 'Type', 'Chair', 'Status', 'AI'].map((h) => (
                  <th key={h} className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-xl text-center text-on-surface-variant">
                    No meetings match the filters.
                  </td>
                </tr>
              ) : (
                list.map((m) => {
                  const dept = departments.find((d) => d.id === m.departmentId);
                  const chair = users.find((u) => u.id === m.chairId);
                  const [cls, label] = STATUS_PILL[m.status] || ['pill-pending', m.status];
                  const type = m.meetingType || 'regular';
                  const typePill = type === 'capstone' ? 'pill-capstone' : type === 'research' ? 'pill-research' : 'pill-regular';
                  const min = minutes.find((x) => x.meetingId === m.id);
                  const locked = !!(min && min.lockedAt);
                  const amends = (min?.amendments || []).length;
                  return (
                    <tr key={m.id} className="border-b border-outline-variant hover:bg-surface-container-low">
                      <td className="py-sm px-md">
                        <div className="font-semibold">{m.title}</div>
                        {m.projectTitle ? <div className="font-caption text-tertiary">{m.projectTitle}</div> : null}
                        <div className="font-caption text-on-surface-variant">{m.venue || ''}</div>
                      </td>
                      <td className="py-sm px-md text-on-surface-variant">{fmtDate(m.date, true)}</td>
                      <td className="py-sm px-md">{dept ? dept.short : '—'}</td>
                      <td className="py-sm px-md">
                        <span className={`pill ${typePill}`}>
                          {type[0].toUpperCase() + type.slice(1)}
                          {m.subType ? ` · ${m.subType}` : ''}
                        </span>
                      </td>
                      <td className="py-sm px-md">{chair ? chair.name : '—'}</td>
                      <td className="py-sm px-md">
                        <div className="flex flex-wrap gap-xs">
                          <span className={`pill ${cls}`}>{label}</span>
                          {locked ? (
                            <span className="pill pill-locked">
                              <span className="material-symbols-outlined text-[12px]">lock</span> LOCKED
                            </span>
                          ) : null}
                          {amends ? <span className="pill pill-amend">{amends} amend{amends > 1 ? 's' : ''}</span> : null}
                        </div>
                      </td>
                      <td className="py-sm px-md">
                        {m.aiProcessed ? <span className="pill pill-ai">AI Processed</span> : <span className="text-on-surface-variant">—</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
