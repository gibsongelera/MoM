import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/requireRole';
import DashboardShell from '@/components/dashboard/DashboardShell';

export const metadata: Metadata = { title: 'My Dashboard | ZPPSU SmartMin' };

export default async function FacultyLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('faculty');
  return (
    <DashboardShell user={user} title="My Dashboard">
      {children}
    </DashboardShell>
  );
}