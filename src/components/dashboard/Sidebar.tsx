'use client';

/**
 * Port of buildSidebar() from assets/js/shared.js.
 *
 * One functional fix over the legacy version: that markup was
 * `hidden md:flex` + a `.open` class that only ever toggled `transform`, so
 * `display:none` on mobile made the transform (and the whole slide-in
 * drawer) a no-op - the hamburger menu never visibly did anything below the
 * md breakpoint. Using a plain `flex` base and letting the CSS media query
 * in globals.css own visibility restores the slide-in behavior that
 * transform/.open was clearly written for.
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ROLE_LABEL, type UserRole } from '@/lib/types/domain';
import type { DashboardUser } from '@/lib/auth/requireRole';
import { initials } from '@/lib/utils/initials';

type NavLink = { href: string; icon: string; label: string };

const NAV_LINKS: Record<UserRole, NavLink[]> = {
  admin: [
    { href: '/admin', icon: 'dashboard', label: 'Dashboard' },
    { href: '/admin/users', icon: 'group', label: 'User Management' },
    { href: '/admin/departments', icon: 'corporate_fare', label: 'Departments & Offices' },
    { href: '/admin/meetings', icon: 'event_note', label: 'All Meetings' },
    { href: '/admin/audit', icon: 'security', label: 'Audit & Privacy' },
    { href: '/admin/settings', icon: 'settings', label: 'System Settings' },
    { href: '/profile', icon: 'account_circle', label: 'My Profile' },
  ],
  head: [
    { href: '/head', icon: 'dashboard', label: 'Dashboard' },
    { href: '/head/calendar', icon: 'calendar_month', label: 'Calendar' },
    { href: '/head/approvals', icon: 'fact_check', label: 'Approvals & Signing' },
    { href: '/head/delegate', icon: 'view_kanban', label: 'Task Delegation' },
    { href: '/head/reports', icon: 'assessment', label: 'Reports' },
    { href: '/profile', icon: 'account_circle', label: 'My Profile' },
  ],
  secretary: [
    { href: '/secretary', icon: 'dashboard', label: 'Dashboard' },
    { href: '/secretary/calendar', icon: 'calendar_month', label: 'Calendar' },
    { href: '/secretary/schedule', icon: 'event', label: 'Meeting Schedule' },
    { href: '/secretary/live-recording', icon: 'mic', label: 'Live Recording' },
    { href: '/secretary/upload-audio', icon: 'upload_file', label: 'Upload Audio' },
    { href: '/secretary/transcript', icon: 'closed_caption', label: 'Transcripts' },
    { href: '/secretary/mom-editor', icon: 'description', label: 'Document Editor' },
    { href: '/secretary/archives', icon: 'history_edu', label: 'Archives' },
    { href: '/profile', icon: 'account_circle', label: 'My Profile' },
  ],
  faculty: [
    { href: '/faculty', icon: 'dashboard', label: 'Dashboard' },
    { href: '/faculty/calendar', icon: 'calendar_month', label: 'Calendar' },
    { href: '/faculty/my-tasks', icon: 'task_alt', label: 'My Tasks' },
    { href: '/faculty/my-meetings', icon: 'groups', label: 'My Meetings' },
    { href: '/faculty/personal-meetings', icon: 'event_available', label: 'Personal Meetings' },
    { href: '/faculty/transcript-view', icon: 'closed_caption', label: 'Transcripts' },
    { href: '/profile', icon: 'account_circle', label: 'My Profile' },
  ],
};

export function Avatar({ user, className, photoUrl }: { user: DashboardUser; className?: string; photoUrl?: string | null }) {
  const size = className ?? 'w-9 h-9 text-body-sm';
  const src = photoUrl ?? user.photoUrl;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- source is a signed Supabase Storage URL (time-limited), not a static asset next/image can cache/optimize
      <img src={src} alt={user.name} className={`${size} rounded-full object-cover border border-outline-variant`} />
    );
  }
  return (
    <div className={`${size} rounded-full bg-primary text-on-primary flex items-center justify-center font-bold`}>
      {initials(user.name)}
    </div>
  );
}

export default function Sidebar({
  user,
  open,
  onClose,
}: {
  user: DashboardUser;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const links = NAV_LINKS[user.role] ?? [];

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside
      className={`app-sidebar ${open ? 'open' : ''} flex flex-col h-full w-[280px] py-lg bg-surface-container border-r border-outline-variant fixed left-0 top-0 z-40`}
    >
      <div className="px-lg mb-lg flex items-center justify-between gap-sm">
        <div className="flex items-center gap-sm">
          <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-primary-md">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              account_balance
            </span>
          </div>
          <div>
            <h1 className="font-h3 text-h3 text-primary leading-tight">ZPPSU SmartMin</h1>
            <p className="font-caption text-caption text-on-surface-variant">Institutional Governance</p>
          </div>
        </div>
        <button className="md:hidden p-xs text-on-surface-variant" onClick={onClose} aria-label="Close menu">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="px-md mb-md">
        <Link
          href="/secretary/live-recording"
          className={`w-full bg-primary text-on-primary rounded-lg py-sm px-md flex items-center justify-center gap-xs font-bold shadow-primary-md hover:opacity-90 transition-all text-body-sm ${
            user.role === 'faculty' ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">mic</span> Quick Record
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto">
        <ul className="space-y-1">
          {links.map((l) => {
            const active = l.href === '/profile' ? pathname === '/profile' : pathname === l.href;
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`${
                    active
                      ? 'bg-primary text-on-primary shadow-primary-md font-bold'
                      : 'text-on-surface-variant hover:bg-surface-container-highest hover:translate-x-1'
                  } rounded-lg mx-sm my-xs px-md py-sm flex items-center gap-md transition-all duration-200`}
                >
                  <span className="material-symbols-outlined">{l.icon}</span>
                  <span className="font-body-md text-body-md">{l.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto pt-md border-t border-outline-variant mx-sm">
        <Link
          href="/profile"
          className="flex items-center gap-sm px-md py-sm rounded-lg bg-surface-container-low border border-outline-variant mb-sm hover:bg-surface-container-highest transition-colors"
          title="Open profile"
        >
          <Avatar user={user} className="w-9 h-9 text-body-sm" />
          <div className="min-w-0 flex-1">
            <p className="font-body-sm text-body-sm font-semibold text-on-surface truncate">{user.name}</p>
            <p className="font-caption text-caption text-on-surface-variant truncate">
              {user.position || ROLE_LABEL[user.role]}
            </p>
          </div>
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full text-left text-on-surface-variant hover:bg-surface-container-highest rounded-lg px-md py-sm flex items-center gap-md transition-all"
        >
          <span className="material-symbols-outlined">logout</span>
          <span className="font-body-md text-body-md">Sign Out</span>
        </button>
      </div>
    </aside>
  );
}