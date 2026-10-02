'use client';

/**
 * Notification bell (ported from the root app's NotificationBell).
 *
 * Notifications are raised by the database (0016 triggers, workflow RPCs) and
 * delivered live over Supabase Realtime, filtered to this user's rows only
 * (without the filter an admin, who can read every row, would receive
 * everyone's notifications).
 *
 * Motion (Emil-weighted): the panel opens from the bell — transform-origin
 * top right — with a 150ms opacity + 0.97 scale; reduced motion removes it.
 */
import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { DashboardUser } from '@/lib/auth/requireRole';
import { notificationHref } from '@/lib/notifications/links';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/ui/cn';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
  meeting_id: string | null;
}

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function NotificationBell({ user }: { user: DashboardUser }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from('notifications')
      .select('id, type, title, body, read, created_at, meeting_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (alive) setItems((data as NotificationRow[] | null) ?? []);
      });
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => setItems((list) => [payload.new as NotificationRow, ...list].slice(0, 20)),
      )
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, user.id]);

  // Close on outside click and on Escape (returning focus to the bell).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = items.filter((n) => !n.read).length;

  async function markRead(id: string) {
    setItems((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await supabase.from('notifications').update({ read: true }).eq('id', id).eq('user_id', user.id);
  }

  async function markAllRead() {
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant transition-colors duration-150 hover:bg-surface-container hover:text-primary"
      >
        <Icon name="notifications" size={24} />
        {unread ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-error px-1 text-[11px] font-bold leading-none text-on-error"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      <div
        id={panelId}
        role="region"
        aria-label="Notifications"
        hidden={!open}
        className={cn(
          'absolute right-0 top-[calc(100%+8px)] z-50 w-[min(360px,calc(100vw-32px))] origin-top-right rounded-xl border border-outline-variant bg-surface-container-lowest shadow-primary-lg',
          'motion-safe:transition-[opacity,transform] motion-safe:duration-150 motion-safe:ease-out',
          'starting:opacity-0 starting:scale-[0.97]',
        )}
      >
        <div className="flex items-center justify-between border-b border-outline-variant px-md py-sm">
          <p className="font-body-md font-semibold">Notifications</p>
          {unread ? (
            <button type="button" onClick={markAllRead} className="min-h-8 rounded-lg px-sm text-body-sm font-semibold text-primary hover:bg-primary/5">
              Mark all as read
            </button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <p className="px-md py-lg text-center font-body-sm text-on-surface-variant">You&apos;re all caught up.</p>
        ) : (
          <ul className="max-h-[420px] divide-y divide-outline-variant overflow-y-auto">
            {items.map((n) => {
              const href = notificationHref(user.role, n.type, n.meeting_id);
              const content = (
                <>
                  <span
                    aria-hidden="true"
                    className={cn('mt-[7px] h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block font-body-sm', !n.read && 'font-semibold')}>
                      {n.title}
                      {!n.read ? <span className="sr-only"> (unread)</span> : null}
                    </span>
                    {n.body ? <span className="block font-caption text-caption text-on-surface-variant">{n.body}</span> : null}
                    <span className="block font-caption text-caption text-on-surface-variant">{whenLabel(n.created_at)}</span>
                  </span>
                </>
              );
              return (
                <li key={n.id}>
                  {href ? (
                    <Link
                      href={href}
                      onClick={() => {
                        void markRead(n.id);
                        setOpen(false);
                      }}
                      className="flex gap-sm px-md py-sm hover:bg-surface-container-low"
                    >
                      {content}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void markRead(n.id)}
                      className="flex w-full gap-sm px-md py-sm text-left hover:bg-surface-container-low"
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
