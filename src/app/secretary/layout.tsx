import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/requireRole';
import DashboardShell from '@/components/dashboard/DashboardShell';

export const metadata: Metadata = { title: 'Secretary Dashboard | ZPPSU SmartMin' };

export default async function SecretaryLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('secretary');
  return (
    <DashboardShell user={user} title="Secretary Dashboard">
      {children}
    </DashboardShell>
  );
}