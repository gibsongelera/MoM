'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { useData } from '@/components/DataProvider';
import { AudioPlayer } from '@/components/AudioPlayer';
import { updateMeetingFields, logAudit } from '@/lib/db';
import { scopeMeetings } from '@/lib/scope';
import { fileNameFor } from '@/lib/summarizer';
import { fmtDate } from '@/lib/utils';
import type { Meeting } from '@/lib/types';

function folderKey(m: Meeting): string {
  const t = m.meetingType || 'regular';
  if (t === 'capstone') return `Capstone / ${m.subType || 'Other'}`;
  if (t === 'research') return `Research / ${m.subType || 'Other'}`;
  return 'Regular Meetings';
}

export default function SecretaryArchives() {
  const { user, ready } = useRequireRole('secretary');
  usePageTitle('Meeting Archives');
  const toast = useToast();
  const { meetings: allMeetings, transcripts, tasks, minutes, taxonomy, ready: dataReady, refresh } = useData();

  async function toggleArchive(m: Meeting) {
    const next = m.status === 'archived' ? (minutes.find((mn) => mn.meetingId === m.id)?.status === 'approved' ? 'approved' : 'transcribed') : 'archived';
    try {
      await updateMeetingFields(m.id, { status: next });
    } catch {
      return toast('Could not update — you may not manage this meeting.', 'error');
    }
    void logAudit(next === 'archived' ? 'meeting_archived' : 'meeting_restored', m.title);
    toast(next === 'archived' ? 'Meeting archived.' : 'Meeting restored.', 'success');
    await refresh();
  }

  const meetings = useMemo(
    () => (user ? scopeMeetings(user, allMeetings) : []),
    [user, allMeetings],
  );

  const [search, setSearch] = useState('');
  const [fs, setFs] = useState('');
  const [fa, setFa] = useState('');
  const [tab, setTab] = useState('all');
  const [sub, setSub] = useState('');

  if (!ready || !user || !dataReady) return null;

  let list = meetings.filter((m) => {
    if (search && !`${m.title} ${m.venue || ''} ${m.projectTitle || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (fs && m.status !== fs) return false;
    if (fa && !m.aiProcessed) return false;
    if (tab !== 'all' && (m.meetingType || 'regular') !== tab) return false;
    if (sub && m.subType !== sub) return false;
    return true;
  });

  const buckets: Record<string, Meeting[]> = {};
  list.forEach((m) => {
    const k = folderKey(m);
    (buckets[k] = buckets[k] || []).push(m);
  });
  const folderKeys = Object.keys(buckets).sort((a, b) => {
    if (a === 'Regular Meetings') return 1;
    if (b === 'Regular Meetings') return -1;
    return a.localeCompare(b);
  });
  folderKeys.forEach((k) => buckets[k].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

  const tabs = ['all', 'regular', 'capstone', 'research'];
  const subChips = tab === 'capstone' || tab === 'research' ? ['', ...(taxonomy[tab as 'capstone' | 'research'] || [])] : [];

  function Card({ m }: { m: Meeting }) {
    const transcript = transcripts.find((t) => t.meetingId === m.id);
    const mTasks = tasks.filter((t) => t.meetingId === m.id);
    const min = minutes.find((x) => x.meetingId === m.id);
    const pillCls = m.status === 'approved' ? 'pill-done' : m.status === 'pending_approval' ? 'pill-progress' : 'pill-pending';
    const type = m.meetingType || 'regular';
    const typePill = type === 'capstone' ? 'pill-capstone' : type === 'research' ? 'pill-research' : 'pill-regular';
    const locked = !!(min && min.lockedAt);
    const filename = fileNameFor(m);
    return (
      <div className="folder-card">
        <div className="flex items-start justify-between mb-md">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <span className="material-symbols-outlined">{type === 'capstone' ? 'school' : type === 'research' ? 'science' : 'history_edu'}</span>
          </div>
          <div className="flex flex-col items-end gap-xs">
            <span className={`pill ${typePill}`}>{type[0].toUpperCase() + type.slice(1)}{m.subType ? ` · ${m.subType}` : ''}</span>
            <span className={`pill ${pillCls}`}>{m.status.replace('_', ' ')}</span>
            {locked ? <span className="pill pill-locked"><span className="material-symbols-outlined text-[12px]">lock</span> LOCKED</span> : null}
            {m.aiProcessed ? <span className="pill pill-ai">AI</span> : null}
          </div>
        </div>
        <h3 className="font-h3 text-h3 mb-xs">{m.title}</h3>
        {m.projectTitle ? <p className="font-body-sm text-tertiary mb-xs"><span className="material-symbols-outlined text-[14px] align-middle">school</span> {m.projectTitle}</p> : null}
        <p className="font-caption text-caption text-on-surface-variant mb-md">{fmtDate(m.date, true)}</p>
        {transcript?.summary ? (
          <div className="bg-tertiary-fixed/30 border-l-4 border-tertiary-container rounded-r-lg p-sm mb-md">
            <p className="font-caption text-caption text-on-surface line-clamp-3">{transcript.summary}</p>
          </div>
        ) : null}
        <div className="bg-surface-container-low border border-outline-variant rounded-lg p-xs mb-md flex items-center gap-xs">
          <span className="material-symbols-outlined text-[14px] text-on-surface-variant">draft</span>
          <code className="font-caption text-caption truncate flex-1" title={filename}>{filename}.pdf</code>
        </div>
        <div className="grid grid-cols-3 gap-sm pt-md border-t border-outline-variant text-center">
          <div><p className="font-h3 text-h3 text-primary">{transcript?.segments?.length || 0}</p><p className="font-caption text-caption text-on-surface-variant">Segments</p></div>
          <div><p className="font-h3 text-h3 text-tertiary-container">{mTasks.length}</p><p className="font-caption text-caption text-on-surface-variant">Tasks</p></div>
          <div><p className="font-h3 text-h3 text-success">{m.durationMin || 0}m</p><p className="font-caption text-caption text-on-surface-variant">Duration</p></div>
        </div>
        <AudioPlayer meetingId={m.id} compact />
        <div className="flex gap-xs mt-md">
          <Link href={`/secretary/transcript?m=${m.id}`} className="flex-1 border border-outline-variant px-sm py-xs rounded-lg hover:bg-surface-container text-body-sm text-center">Transcript</Link>
          <Link href={`/secretary/mom-editor?m=${m.id}`} className="flex-1 bg-primary text-on-primary px-sm py-xs rounded-lg shadow-primary-md text-body-sm text-center">Document</Link>
          <button
            onClick={() => toggleArchive(m)}
            title={m.status === 'archived' ? 'Restore meeting' : 'Archive meeting'}
            className="border border-outline-variant px-sm py-xs rounded-lg hover:bg-surface-container flex items-center"
          >
            <span className="material-symbols-outlined text-[18px]">{m.status === 'archived' ? 'unarchive' : 'archive'}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="mb-lg">
        <h1 className="font-h1 text-h1 flex items-center gap-sm">
          <span className="material-symbols-outlined text-primary text-[36px]">history_edu</span> Meeting Archives
        </h1>
        <p className="font-body-md text-on-surface-variant">Folder-organized library of past meetings with transcripts, minutes, and auto-generated filenames.</p>
      </header>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md mb-md flex flex-col md:flex-row gap-sm">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, venue, or project" className="w-full pl-xl pr-md py-sm bg-surface-container border-transparent focus:border-primary rounded-lg" />
        </div>
        <select value={fs} onChange={(e) => setFs(e.target.value)} className="bg-surface-container border-transparent focus:border-primary rounded-lg py-sm px-md">
          <option value="">All Status</option>
          <option value="scheduled">Scheduled</option>
          <option value="transcribed">Transcribed</option>
          <option value="pending_approval">Pending</option>
          <option value="approved">Approved</option>
          <option value="archived">Archived</option>
        </select>
        <select value={fa} onChange={(e) => setFa(e.target.value)} className="bg-surface-container border-transparent focus:border-primary rounded-lg py-sm px-md">
          <option value="">All</option>
          <option value="ai">AI Processed Only</option>
        </select>
      </div>

      <div className="flex gap-xs border-b border-outline-variant mb-md flex-wrap">
        {tabs.map((t) => (
          <button key={t} onClick={() => { setTab(t); setSub(''); }} className={`px-md py-sm rounded-t-lg font-label-caps text-label-caps border-b-2 ${tab === t ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-primary'}`}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {subChips.length ? (
        <div className="flex flex-wrap gap-xs mb-md">
          {subChips.map((s) => (
            <button key={s || 'all'} onClick={() => setSub(s)} className={`pill ${sub === s ? 'pill-capstone ring-2 ring-primary' : 'pill-pending'} hover:opacity-80`}>
              {s || 'All sub-types'}
            </button>
          ))}
        </div>
      ) : null}

      <div className="space-y-lg">
        {list.length === 0 ? (
          <p className="text-on-surface-variant text-center py-xl">No archived meetings match the current filters.</p>
        ) : (
          folderKeys.map((key) => (
            <section key={key}>
              <h3 className="font-h3 text-h3 mb-sm flex items-center gap-sm">
                <span className="material-symbols-outlined text-primary">folder</span>
                {key}
                <span className="font-caption text-caption text-on-surface-variant">({buckets[key].length})</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
                {buckets[key].map((m) => (
                  <Card key={m.id} m={m} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
