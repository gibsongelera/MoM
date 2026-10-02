'use client';

import { useEffect, useState } from 'react';
import type { DashboardUser } from '@/lib/auth/requireRole';
import { ToastProvider } from '@/components/ui/Toast';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

/**
 * App shell: sidebar + topbar + the page.
 *
 * Landmarks: the Topbar <header> sits beside (not inside) <main>, and a skip
 * link lets keyboard users jump past the navigation (WCAG 2.4.1).
 */
export default function DashboardShell({
  user,
  title,
  children,
}: {
  user: DashboardUser;
  title: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  return (
    <ToastProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-md focus:top-md focus:z-[70] focus:rounded-lg focus:bg-primary focus:px-md focus:py-sm focus:text-on-primary"
      >
        Skip to main content
      </a>
      <div className="flex min-h-screen">
        <Sidebar user={user} open={mobileOpen} onClose={() => setMobileOpen(false)} />
        <div className="sidebar-scrim" data-open={mobileOpen} aria-hidden="true" onClick={() => setMobileOpen(false)} />
        <div className="app-main flex-1 md:ml-[280px] flex flex-col min-h-screen">
          <Topbar user={user} title={title} menuOpen={mobileOpen} onMenuClick={() => setMobileOpen(true)} />
          <main id="main" tabIndex={-1} className="p-lg max-w-container-max mx-auto w-full flex-1 focus:outline-none">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
