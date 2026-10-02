import { AppShell } from '@/components/AppShell';

export const dynamic = 'force-dynamic';

// Layout for every authenticated page. Individual pages call useRequireRole()
// to enforce their specific role; the shell renders the role-appropriate nav.
export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
