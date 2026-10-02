'use client';

import { AppProvider } from '@/lib/auth';
import { DataProvider } from './DataProvider';
import { ToastProvider } from './Toast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <DataProvider>
        <ToastProvider>{children}</ToastProvider>
      </DataProvider>
    </AppProvider>
  );
}
