'use client';

/**
 * Port of buildSidebar() from assets/js/shared.js.
 *
 * Below the md breakpoint this is an off-canvas drawer: it is `inert` while
 * closed (so its links are not in the tab order), closes when a link is
 * followed, and Escape / the scrim close it (handled in DashboardShell).
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ROLE_LABEL, type UserRole } from '@/lib/types/domain';
import type { DashboardUser } from '@/lib/auth/requireRole';
import { initials } from '@/lib/utils/initials';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/ui/cn';

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
    { href: '/secretary/meetings', icon: 'event', label: 'Meetings' },
    { href: '/secretary/calendar', icon: 'calendar_month', label: 'Calendar' },
    { href: '/secretary/live-recording', icon: 'mic', label: 'Live Recording' },
    { href: '/secretary/upload-audio', icon: 'upload_file', label: 'Upload Audio' },
    { href: '/secretary/transcript', icon: 'closed_caption', label: 'Transcripts' },
    { href: '/secretary/mom-editor', icon: 'description', label: 'Minutes' },
    { href: '/secretary/archives', icon: 'history', label: 'Meeting History' },
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

/** Role home pages match exactly; everything else also matches its sub-routes. */
function isActive(href: string, pathname: string): boolean {
  const isRoleHome = Object.keys(NAV_LINKS).some((r) => href === `/${r}`);
  if (isRoleHome || href === '/profile') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Avatar({ user, className, photoUrl }: { user: DashboardUser; className?: string; photoUrl?: string | null }) {
  const size = className ?? 'w-9 h-9 text-body-sm';
  const src = photoUrl ?? user.photoUrl;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- source is a signed Supabase Storage URL (time-limited), not a static asset next/image can cache/optimize
      <img src={src} alt="" className={`${size} rounded-full object-cover border border-outline-variant`} />
    );
  }
  return (
    <div aria-hidden="true" className={`${size} rounded-full bg-primary text-on-primary flex items-center justify-center font-bold`}>
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
  const isMobile = useMediaQuery('(max-width: 767.98px)');
  const closeRef = useRef<HTMLButtonElement>(null);

  // Opening the drawer on a phone moves focus into it.
  useEffect(() => {
    if (open && isMobile) closeRef.current?.focus();
  }, [open, isMobile]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside
      inert={isMobile && !open ? true : undefined}
      aria-label="Sidebar"
      className={`app-sidebar ${open ? 'open' : ''} flex flex-col h-full w-[280px] py-lg bg-surface-container border-r border-outline-variant fixed left-0 top-0 z-40`}
    >
      <div className="px-lg mb-lg flex items-center justify-between gap-sm">
        <div className="flex items-center gap-sm">
          <Logo size={44} alt="" priority />
          <div>
            <p className="font-h3 text-h3 text-primary leading-tight">ZPPSU SmartMin</p>
            <p className="font-caption text-caption text-on-surface-variant">Institutional Governance</p>
          </div>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-highest"
          onClick={onClose}
          aria-label="Close menu"
        >
          <Icon name="close" size={24} />
        </button>
      </div>

      {user.role === 'secretary' ? (
        <div className="px-md mb-md">
          <Link
            href="/secretary/meetings?emergency=1"
            onClick={onClose}
            className="w-full bg-primary text-on-primary rounded-lg min-h-10 py-sm px-md flex items-center justify-center gap-xs font-bold shadow-primary-md hover:bg-primary-container transition-colors duration-150 text-body-sm"
          >
            <Icon name="mic" size={20} /> Start emergency meeting
          </Link>
        </div>
      ) : null}

      <nav aria-label="Main" className="flex-1 overflow-y-auto">
        <ul className="space-y-1">
          {links.map((l) => {
            const active = isActive(l.href, pathname);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={onClose}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-lg mx-sm my-xs px-md py-sm flex items-center gap-md transition-colors duration-150',
                    active
                      ? 'bg-primary text-on-primary shadow-primary-md font-bold'
                      : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface',
                  )}
                >
                  <Icon name={l.icon} size={24} />
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
          onClick={onClose}
          className="flex items-center gap-sm px-md py-sm rounded-lg bg-surface-container-low border border-outline-variant mb-sm hover:bg-surface-container-highest transition-colors duration-150"
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
          type="button"
          onClick={handleSignOut}
          className="w-full text-left text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface rounded-lg px-md py-sm flex items-center gap-md transition-colors duration-150"
        >
          <Icon name="logout" size={24} />
          <span className="font-body-md text-body-md">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
