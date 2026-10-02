'use client';

// Topbar — React port of buildTopbar() in assets/js/shared.js.
// Sticky glassy bar: mobile hamburger, page title, search, online/offline pill,
// notifications bell, and profile chip.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/nav';
import { Avatar } from './Avatar';
import { NotificationBell } from './NotificationBell';
import { GlobalSearch } from './GlobalSearch';

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

export function Topbar({
  title,
  onToggleSidebar,
  sidebarOpen = false,
}: {
  title: string;
  onToggleSidebar: () => void;
  sidebarOpen?: boolean;
}) {
  const { user } = useAuth();
  const online = useOnline();
  if (!user) return null;

  return (
    <header className="bg-surface/80 backdrop-blur-md sticky top-0 z-30 shadow-sm border-b border-outline-variant px-lg py-sm flex justify-between items-center w-full h-[64px] no-print">
      <div className="flex items-center gap-md flex-1">
        <button
          className="lg:hidden p-xs text-on-surface hover:text-primary transition-colors"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={sidebarOpen}
        >
          <span className="material-symbols-outlined">{sidebarOpen ? 'close' : 'menu'}</span>
        </button>
        {title ? (
          <h2 className="font-h3 text-h3 text-on-surface hidden md:block">{title}</h2>
        ) : null}
        <GlobalSearch />
      </div>
      <div className="flex items-center gap-md">
        {online ? (
          <span className="hidden md:inline-flex items-center gap-xs px-sm py-xs rounded-full font-label-caps text-label-caps border bg-success-container text-success border-success/30">
            <span className="material-symbols-outlined text-[14px]">wifi</span> ONLINE
          </span>
        ) : (
          <span className="hidden md:inline-flex items-center gap-xs px-sm py-xs rounded-full font-label-caps text-label-caps border bg-tertiary-fixed text-on-tertiary-fixed-variant border-tertiary-container/40">
            <span className="material-symbols-outlined text-[14px]">wifi_off</span> OFFLINE MODE
          </span>
        )}
        <NotificationBell role={user.role} />
        <div className="w-[1px] h-6 bg-outline-variant mx-xs hidden md:block"></div>
        <Link href="/profile" className="flex items-center gap-sm hover:opacity-80 transition-opacity">
          <div className="text-right hidden md:block">
            <p className="font-label-caps text-label-caps text-on-surface">{user.name}</p>
            <p className="font-caption text-caption text-on-surface-variant">
              {ROLE_LABEL[user.role] || user.role}
            </p>
          </div>
          <Avatar user={user} size="w-9 h-9 text-body-sm" />
        </Link>
      </div>
    </header>
  );
}
