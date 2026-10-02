'use client';

/**
 * Port of buildTopbar() from assets/js/shared.js. The decorative search box
 * and the always-on notification dot were removed: controls that look
 * interactive must do something. Notifications live in NotificationBell.
 */
import Link from 'next/link';
import { ROLE_LABEL } from '@/lib/types/domain';
import type { DashboardUser } from '@/lib/auth/requireRole';
import { useOnline } from '@/lib/hooks/useOnline';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from './Sidebar';
import NotificationBell from './NotificationBell';

export default function Topbar({
  user,
  title,
  menuOpen,
  onMenuClick,
}: {
  user: DashboardUser;
  title: string;
  menuOpen: boolean;
  onMenuClick: () => void;
}) {
  const online = useOnline();

  return (
    <header className="bg-surface/80 backdrop-blur-md sticky top-0 z-30 shadow-sm border-b border-outline-variant px-lg py-sm flex justify-between items-center w-full h-[64px] no-print">
      <div className="flex items-center gap-md flex-1 min-w-0">
        <button
          type="button"
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-on-surface hover:bg-surface-container"
          onClick={onMenuClick}
          aria-label="Open menu"
          aria-expanded={menuOpen}
        >
          <Icon name="menu" size={24} />
        </button>
        {title ? <p className="font-h3 text-h3 text-on-surface hidden md:block truncate">{title}</p> : null}
      </div>
      <div className="flex items-center gap-md">
        <span
          className={`hidden md:inline-flex items-center gap-xs px-sm py-xs rounded-full font-label-caps text-label-caps uppercase border ${
            online
              ? 'bg-success-container text-on-success-container border-success/30'
              : 'bg-tertiary-fixed text-on-tertiary-fixed-variant border-tertiary-container/40'
          }`}
        >
          <Icon name={online ? 'wifi' : 'wifi_off'} size={14} />
          {online ? 'Online' : 'Offline'}
        </span>
        <NotificationBell user={user} />
        <div className="w-[1px] h-6 bg-outline-variant mx-xs hidden md:block" />
        <Link href="/profile" className="flex items-center gap-sm rounded-lg hover:opacity-80 transition-opacity duration-150">
          <div className="text-right hidden md:block">
            <p className="font-label-caps text-label-caps text-on-surface">{user.name}</p>
            <p className="font-caption text-caption text-on-surface-variant">{ROLE_LABEL[user.role]}</p>
          </div>
          <Avatar user={user} className="w-9 h-9 text-body-sm" />
          <span className="sr-only md:hidden">Open my profile</span>
        </Link>
      </div>
    </header>
  );
}
