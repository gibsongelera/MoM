'use client';

// Topbar notifications. Reads the signed-in user's RLS-scoped rows from
// useData() (the `notifications` table), shows an unread badge, and lets them
// mark items read individually or all at once.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/components/DataProvider';
import { markNotificationRead, markAllNotificationsRead } from '@/lib/db';
import type { Notification } from '@/lib/types';

const ICON: Record<string, string> = {
  ai: 'auto_awesome',
  approval: 'fact_check',
  task: 'task_alt',
  info: 'info',
};

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Best-effort deep link so a notification takes you somewhere useful.
function hrefFor(role: string | undefined, n: Notification): string | null {
  if (n.type === 'approval') return role === 'head' ? '/head/approvals' : '/secretary/mom-editor';
  if (n.type === 'ai') return role === 'secretary' ? '/secretary/transcript' : null;
  if (n.type === 'task') return role === 'faculty' ? '/faculty/my-tasks' : '/head/delegate';
  return null;
}

export function NotificationBell({ role }: { role?: string }) {
  const router = useRouter();
  const { notifications, refresh } = useData();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const sorted = [...notifications].sort((a, b) => b.ts - a.ts);
  const unread = sorted.filter((n) => !n.read).length;

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function openItem(n: Notification) {
    if (!n.read) {
      try {
        await markNotificationRead(n.id);
        await refresh();
      } catch {
        /* non-fatal */
      }
    }
    const href = hrefFor(role, n);
    setOpen(false);
    if (href) router.push(href);
  }

  async function markAll() {
    try {
      await markAllNotificationsRead();
      await refresh();
    } catch {
      /* non-fatal */
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        className="p-xs text-on-surface-variant hover:text-primary transition-colors relative focus-visible:ring-2 focus-visible:ring-primary rounded"
        title="Notifications"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="material-symbols-outlined">notifications</span>
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-error text-on-error rounded-full text-[10px] font-bold flex items-center justify-center border border-surface">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 mt-sm w-[340px] max-w-[calc(100vw-24px)] bg-surface-container-lowest border border-outline-variant rounded-xl shadow-primary-lg z-50 overflow-hidden"
        >
          <div className="px-md py-sm border-b border-outline-variant flex items-center justify-between">
            <h3 className="font-label-caps text-label-caps text-on-surface flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px] text-primary">notifications</span>
              Notifications
            </h3>
            {unread > 0 ? (
              <button onClick={markAll} className="font-caption text-caption text-primary hover:underline">
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {sorted.length === 0 ? (
              <div className="p-xl text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-[36px] text-success block mb-xs">check_circle</span>
                <p className="font-body-sm">You&apos;re all caught up.</p>
              </div>
            ) : (
              sorted.map((n) => (
                <button
                  key={n.id}
                  role="menuitem"
                  onClick={() => openItem(n)}
                  className={`w-full text-left px-md py-sm flex gap-sm border-b border-outline-variant/60 hover:bg-surface-container-low transition-colors ${
                    n.read ? '' : 'bg-primary-fixed/30'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-[20px] shrink-0 mt-0.5 ${
                      n.read ? 'text-on-surface-variant' : 'text-primary'
                    }`}
                  >
                    {ICON[n.type] || 'notifications'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-xs">
                      <p className={`font-body-sm truncate ${n.read ? 'text-on-surface-variant' : 'font-semibold text-on-surface'}`}>
                        {n.title}
                      </p>
                      {!n.read ? <span className="w-2 h-2 rounded-full bg-error shrink-0" aria-hidden /> : null}
                    </div>
                    {n.body ? <p className="font-caption text-caption text-on-surface-variant line-clamp-2">{n.body}</p> : null}
                    <p className="font-caption text-caption text-on-surface-variant/70 mt-0.5">{timeAgo(n.ts)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
