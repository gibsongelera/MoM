/**
 * Server-side role guard for dashboard layouts.
 *
 * Port of guardPage(requiredRole) from the legacy assets/js/shared.js: no
 * session -> /login, wrong role -> that role's own dashboard. RLS is still
 * the real access boundary (per 0002_rls.sql) - this only keeps a faculty
 * account from rendering the admin shell, it does not gate any data.
 */
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ROLE_DASHBOARDS, type UserRole } from '@/lib/types/domain';

export interface DashboardUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  position: string | null;
  department_id: string | null;
  photo_path: string | null;
  /** Signed, time-limited URL for photo_path - the avatars bucket is
   * private, so the raw path is never directly loadable as an <img src>. */
  photoUrl: string | null;
}

const AVATAR_URL_TTL_SEC = 60 * 60;

/** Shared by requireRole() and requireAuth() (/profile, reachable by every role). */
async function loadCurrentUser(): Promise<DashboardUser> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (typeof userId !== 'string') {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, email, role, position, department_id, photo_path, active')
    .eq('id', userId)
    .single();

  if (!profile) {
    redirect('/login');
  }
  // Pending or deactivated accounts get no dashboard. RLS denies them data
  // anyway (sm_* helpers require an active profile); this explains why.
  const { active, ...rest } = profile;
  if (!active) {
    redirect('/login?reason=inactive');
  }

  let photoUrl: string | null = null;
  if (profile.photo_path) {
    const { data: signed } = await supabase.storage.from('avatars').createSignedUrl(profile.photo_path, AVATAR_URL_TTL_SEC);
    photoUrl = signed?.signedUrl ?? null;
  }

  return { ...rest, photoUrl };
}

export async function requireRole(role: UserRole): Promise<DashboardUser> {
  const user = await loadCurrentUser();
  if (user.role !== role) {
    redirect(ROLE_DASHBOARDS[user.role] ?? '/');
  }
  return user;
}

/** Any signed-in role - used by /profile, which every role's sidebar links to. */
export async function requireAuth(): Promise<DashboardUser> {
  return loadCurrentUser();
}
