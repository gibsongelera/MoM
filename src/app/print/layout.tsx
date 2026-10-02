import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/requireRole';

export const metadata: Metadata = { title: 'Print | ZPPSU SmartMin' };

/**
 * Bare layout for printable documents: no sidebar or topbar, so printing (or
 * "Save as PDF") produces only the document. RLS still decides what the
 * signed-in user may read.
 */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return <main className="min-h-screen bg-surface-container-low px-md py-lg print:bg-white print:p-0">{children}</main>;
}
