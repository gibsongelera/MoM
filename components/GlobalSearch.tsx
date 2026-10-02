'use client';

// Global search (rec #1): filters the signed-in user's scoped meetings, tasks,
// transcripts and (for admin/head) people from useData(), with keyboard-navigable
// results. No new API — searches the data already in memory.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useData } from '@/components/DataProvider';
import { scopeMeetings, scopeTasks } from '@/lib/scope';
import { fmtDate } from '@/lib/utils';
import type { Meeting, Role } from '@/lib/types';

interface Result {
  kind: 'meeting' | 'task' | 'transcript' | 'person';
  id: string;
  title: string;
  sub: string;
  href: string;
  icon: string;
}

function meetingHref(role: Role, m: Meeting): string {
  if (role === 'head') return `/head/approvals?m=${m.id}`;
  if (role === 'faculty') return `/faculty/transcript-view?m=${m.id}`;
  if (role === 'secretary') return m.aiProcessed ? `/secretary/transcript?m=${m.id}` : `/secretary/schedule?id=${m.id}`;
  return `/assistant?m=${m.id}`;
}

export function GlobalSearch() {
  const router = useRouter();
  const { user } = useAuth();
  const data = useData();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo<Result[]>(() => {
    const term = q.trim().toLowerCase();
    if (!user || term.length < 2) return [];
    const meetings = scopeMeetings(user, data.meetings);
    const tasks = scopeTasks(user, data.tasks);
    const out: Result[] = [];

    for (const m of meetings) {
      if (`${m.title} ${m.venue || ''} ${m.projectTitle || ''}`.toLowerCase().includes(term)) {
        out.push({ kind: 'meeting', id: m.id, title: m.title, sub: `${fmtDate(m.date)} · ${String(m.status).replace('_', ' ')}`, href: meetingHref(user.role, m), icon: 'event' });
      }
    }
    for (const t of tasks) {
      if (`${t.title} ${t.description || ''}`.toLowerCase().includes(term)) {
        const href = user.role === 'faculty' ? `/faculty/my-tasks?t=${t.id}` : `/head/delegate`;
        out.push({ kind: 'task', id: t.id, title: t.title, sub: `Task · ${String(t.status).replace('_', ' ')}${t.deadline ? ' · due ' + t.deadline : ''}`, href, icon: 'task_alt' });
      }
    }
    // Transcript content search
    const visibleMeetingIds = new Set(meetings.map((m) => m.id));
    for (const tr of data.transcripts) {
      if (!visibleMeetingIds.has(tr.meetingId)) continue;
      const hit = (tr.summary || '').toLowerCase().includes(term) || (tr.segments || []).some((s) => s.text.toLowerCase().includes(term));
      if (hit) {
        const m = meetings.find((x) => x.id === tr.meetingId);
        if (m && !out.some((r) => r.kind === 'meeting' && r.id === m.id)) {
          out.push({ kind: 'transcript', id: tr.id, title: m.title, sub: 'Transcript match', href: meetingHref(user.role, m), icon: 'closed_caption' });
        }
      }
    }
    if (user.role === 'admin' || user.role === 'head') {
      for (const p of data.users) {
        if (`${p.name} ${p.email} ${p.position || ''}`.toLowerCase().includes(term)) {
          out.push({ kind: 'person', id: p.id, title: p.name, sub: `${p.role} · ${p.email}`, href: user.role === 'admin' ? '/admin/users' : '/head/members', icon: 'person' });
        }
      }
    }
    return out.slice(0, 12);
  }, [q, user, data]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function go(r: Result) {
    setOpen(false);
    setQ('');
    router.push(r.href);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
  }

  return (
    <div className="relative w-full max-w-md hidden lg:block" ref={wrapRef}>
      <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="global-search-results"
        className="w-full bg-surface-container border-transparent focus:border-primary focus:ring-0 rounded-lg pl-xl pr-md py-sm font-body-sm text-body-sm"
        placeholder="Search meetings, tasks, or transcripts..."
        type="text"
      />
      {open && q.trim().length >= 2 ? (
        <div id="global-search-results" role="listbox" className="absolute left-0 right-0 mt-xs bg-surface-container-lowest border border-outline-variant rounded-xl shadow-primary-lg z-50 overflow-hidden max-h-[420px] overflow-y-auto">
          {results.length === 0 ? (
            <p className="p-md font-body-sm text-on-surface-variant text-center">No matches for &ldquo;{q.trim()}&rdquo;.</p>
          ) : (
            results.map((r, i) => (
              <button
                key={r.kind + r.id}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
                className={`w-full text-left px-md py-sm flex items-center gap-sm border-b border-outline-variant/50 last:border-0 ${i === active ? 'bg-primary-fixed/40' : 'hover:bg-surface-container-low'}`}
              >
                <span className="material-symbols-outlined text-[20px] text-primary shrink-0">{r.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-body-sm font-semibold truncate">{r.title}</span>
                  <span className="block font-caption text-caption text-on-surface-variant truncate">{r.sub}</span>
                </span>
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">north_east</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
