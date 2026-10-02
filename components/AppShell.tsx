'use client';

// AppShell — React port of mountLayout() in assets/js/shared.js.
// Wraps authenticated pages with the fixed Sidebar + sticky Topbar and a main
// content column. Provides a page-title context so pages can set the topbar
// title (usePageTitle), plus flushes the offline recording queue on reconnect.

import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { logAudit } from '@/lib/db';
import { useData } from './DataProvider';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { FloatingAssistant } from './FloatingAssistant';

const TitleCtx = createContext<(t: string) => void>(() => {});

/** Set the topbar title for the current page. */
export function usePageTitle(title: string) {
  const setTitle = useContext(TitleCtx);
  useEffect(() => {
    setTitle(title);
  }, [title, setTitle]);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { loading: dataLoading } = useData();
  const [title, setTitle] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // audit a page view whenever the shell mounts (parity with mountLayout)
  useEffect(() => {
    if (user) void logAudit('page_view', window.location.pathname);
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="skeleton w-40 h-6" />
      </div>
    );
  }
  // useRequireRole on the page handles the redirect; render nothing meanwhile.
  if (!user) return null;

  return (
    <TitleCtx.Provider value={setTitle}>
      {dataLoading ? (
        <div className="fixed top-0 inset-x-0 h-1 z-[60] bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse no-print" aria-hidden />
      ) : null}
      <div id="app-shell" className="flex min-h-screen">
        <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
        {/* scrim behind the drawer while it's open (hidden once the rail docks at lg) */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
        )}
        <main className="app-main flex-1 lg:ml-[280px] flex flex-col min-h-screen">
          <Topbar
            title={title}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
          />
          {children}
        </main>
        <FloatingAssistant />
      </div>
    </TitleCtx.Provider>
  );
}
