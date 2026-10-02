'use client';

import { useState } from 'react';
import type { DashboardUser } from '@/lib/auth/requireRole';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

/**
 * Port of the div#app-shell / main.app-main structure that
 * SmartMin.mountLayout() built by moving the page's existing children under
 * a generated <main>. In React the page just renders as `children` here
 * instead - same resulting DOM shape (aside + main[topbar, content]).
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

  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className="app-main flex-1 md:ml-[280px] flex flex-col min-h-screen">
        <Topbar user={user} title={title} onMenuClick={() => setMobileOpen(true)} />
        <div className="p-lg max-w-container-max mx-auto w-full flex-1">{children}</div>
      </main>
    </div>
  );
}