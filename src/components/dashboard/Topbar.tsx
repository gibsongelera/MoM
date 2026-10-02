'use client';

/** Port of buildTopbar() from assets/js/shared.js. Online/offline reflects
 * real navigator.onLine state (the legacy version did too); search is
 * decorative for now - no results are wired up yet. */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ROLE_LABEL } from '@/lib/types/domain';
import type { DashboardUser } from '@/lib/auth/requireRole';
import { Avatar } from './Sidebar';

export default function Topbar({
  user,
  title,
  onMenuClick,
}: {
  user: DashboardUser;
  title: string;
  onMenuClick: () => void;
}) {
  // Lazy initializer, not a setState-in-effect: window is undefined during
  // the server render pass, so this only reads real navigator.onLine once
  // the component mounts in the browser.
  const [online, setOnline] = useState(() => (typeof window === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <header className="bg-surface/80 backdrop-blur-md sticky top-0 z-30 shadow-sm border-b border-outline-variant px-lg py-sm flex justify-between items-center w-full h-[64px] no-print">
      <div className="flex items-center gap-md flex-1">
        <button className="md:hidden p-xs text-on-surface" onClick={onMenuClick} aria-label="Open menu">
          <span className="material-symbols-outlined">menu</span>
        </button>
        {title ? <h2 className="font-h3 text-h3 text-on-surface hidden md:block">{title}</h2> : null}
        <div className="relative w-full max-w-md hidden lg:block">
          <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant">
            search
          </span>
          <input
            className="w-full bg-surface-container border-transparent focus:border-primary focus:ring-0 rounded-lg pl-xl pr-md py-sm font-body-sm text-body-sm"
            placeholder="Search meetings, tasks, or transcripts..."
            type="text"
          />
        </div>
      </div>
      <div className="flex items-center gap-md">
        <span
          className={`hidden md:inline-flex items-center gap-xs px-sm py-xs rounded-full font-label-caps text-label-caps border ${
            online
              ? 'bg-success-container text-success border-success/30'
              : 'bg-tertiary-fixed text-on-tertiary-fixed-variant border-tertiary-container/40'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">{online ? 'wifi' : 'wifi_off'}</span>
          {online ? 'ONLINE' : 'OFFLINE MODE'}
        </span>
        <button className="p-xs text-on-surface-variant hover:text-primary transition-colors relative" title="Notifications">
          <span className="material-symbols-outlined">notifications</span>
          <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full border border-surface" />
        </button>
        <div className="w-[1px] h-6 bg-outline-variant mx-xs hidden md:block" />
        <Link href="/profile" className="flex items-center gap-sm hover:opacity-80 transition-opacity">
          <div className="text-right hidden md:block">
            <p className="font-label-caps text-label-caps text-on-surface">{user.name}</p>
            <p className="font-caption text-caption text-on-surface-variant">{ROLE_LABEL[user.role]}</p>
          </div>
          <Avatar user={user} className="w-9 h-9 text-body-sm" />
        </Link>
      </div>
    </header>
  );
}