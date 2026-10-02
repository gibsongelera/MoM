import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/requireRole';
import { ROLE_LABEL } from '@/lib/types/domain';
import DashboardShell from '@/components/dashboard/DashboardShell';

export const metadata: Metadata = { title: 'My Profile | ZPPSU SmartMin' };

/** Reachable by every role - not under any of the 4 role directories, so it
 * uses requireAuth() (any signed-in user) rather than requireRole(). The
 * sidebar still renders the right nav set because DashboardShell reads
 * user.role. */
export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  return (
    <DashboardShell user={user} title={`My Profile · ${ROLE_LABEL[user.role]}`}>
      {children}
    </DashboardShell>
  );
}
