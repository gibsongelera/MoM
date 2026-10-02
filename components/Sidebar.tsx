'use client';

// Sidebar — React port of buildSidebar() in assets/js/shared.js.
// Same 280px fixed maroon-accented rail, role-filtered nav, Quick Record CTA,
// profile chip, and Sign Out.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { NAV_LINKS, ROLE_LABEL } from '@/lib/nav';
import { Avatar } from './Avatar';
import { Logo } from './Logo';
import { cx } from '@/lib/utils';

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  if (!user) return null;

  const links = NAV_LINKS[user.role] || [];
  const quickRecordDisabled = user.role === 'faculty';

  return (
    <aside
      className={cx(
        'app-sidebar flex flex-col h-full w-[280px] py-lg bg-surface-container border-r border-outline-variant fixed left-0 top-0 z-40',
        // On mobile the rail is off-canvas (globals.css translates it out); the
        // `open` class slides it in. It's always visible from md up.
        open && 'open',
      )}
    >
      {/* Drawer-only "back" control to close the menu on small screens. */}
      <button
        type="button"
        onClick={onNavigate}
        className="lg:hidden mx-md mb-sm px-md py-xs rounded-lg flex items-center gap-xs text-on-surface-variant hover:bg-surface-container-highest hover:text-primary transition-colors self-start focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="Close menu"
      >
        <span className="material-symbols-outlined">arrow_back</span>
        <span className="font-label-caps text-label-caps">Back</span>
      </button>

      <div className="px-lg mb-lg flex items-center gap-sm">
        <Link href="/" className="shrink-0" aria-label="ZPPSU SmartMin Home">
          <Logo size={50} />
        </Link>
        <div className="min-w-0">
          <Link href="/" tabIndex={-1}>
            <h1 className="font-h3 text-h3 text-primary leading-tight truncate">ZPPSU SmartMin</h1>
          </Link>
          <p className="font-caption text-caption text-on-surface-variant truncate">Institutional Governance</p>
        </div>
      </div>
 

      <div className="px-md mb-md">
        <Link
          href="/secretary/live-recording"
          onClick={onNavigate}
          className={cx(
            'w-full bg-primary text-on-primary rounded-lg py-sm px-md flex items-center justify-center gap-xs font-bold shadow-primary-md hover:opacity-90 transition-all text-body-sm',
            quickRecordDisabled && 'pointer-events-none opacity-50',
          )}
          aria-disabled={quickRecordDisabled}
        >
          <span className="material-symbols-outlined text-[20px]">mic</span> Quick Record
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto">
        <ul className="space-y-1">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + '/');
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={onNavigate}
                  className={cx(
                    'rounded-lg mx-sm my-xs px-md py-sm flex items-center gap-md transition-all duration-200',
                    active
                      ? 'bg-primary text-on-primary shadow-primary-md font-bold'
                      : 'text-on-surface-variant hover:bg-surface-container-highest hover:translate-x-1',
                  )}
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
          onClick={onNavigate}
          className="flex items-center gap-sm px-md py-sm rounded-lg bg-surface-container-low border border-outline-variant mb-sm hover:bg-surface-container-highest transition-colors"
          title="Open profile"
        >
          <Avatar user={user} size="w-9 h-9 text-body-sm" />
          <div className="min-w-0 flex-1">
            <p className="font-body-sm text-body-sm font-semibold text-on-surface truncate">
              {user.name}
            </p>
            <p className="font-caption text-caption text-on-surface-variant truncate">
              {user.position || ROLE_LABEL[user.role] || user.role}
            </p>
          </div>
        </Link>
        <button
          onClick={logout}
          className="w-full text-left text-on-surface-variant hover:bg-surface-container-highest rounded-lg px-md py-sm flex items-center gap-md transition-all"
        >
          <span className="material-symbols-outlined">logout</span>
          <span className="font-body-md text-body-md">Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
