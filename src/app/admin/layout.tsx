import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/requireRole';
import DashboardShell from '@/components/dashboard/DashboardShell';

export const metadata: Metadata = { title: 'Admin Dashboard | ZPPSU SmartMin' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('admin');
  return (
    <DashboardShell user={user} title="Admin Dashboard">
      {children}
    </DashboardShell>
  );
}