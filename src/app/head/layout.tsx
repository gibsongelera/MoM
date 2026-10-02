import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/requireRole';
import DashboardShell from '@/components/dashboard/DashboardShell';

export const metadata: Metadata = { title: 'Department Dashboard | ZPPSU SmartMin' };

export default async function HeadLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('head');
  return (
    <DashboardShell user={user} title="Department Dashboard">
      {children}
    </DashboardShell>
  );
}