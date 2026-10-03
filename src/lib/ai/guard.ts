/**
 * Auth guard for the AI routes.
 *
 * These endpoints spend money on every call. Without a session check they are an
 * open proxy to our Anthropic key for anyone who finds the URL, so each route
 * verifies a signed-in Supabase session before doing any work.
 */
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/types/domain';

export async function requireSession(): Promise<{ userId: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || typeof sub !== 'string') return null;
  return { userId: sub };
}

export interface StaffCaller {
  userId: string;
  role: Extract<UserRole, 'admin' | 'head' | 'secretary'>;
  departmentId: string | null;
}

/**
 * A signed-in, ACTIVE admin / head / secretary — the only callers allowed to
 * trigger paid AI work or send email. Faculty and pending accounts get null.
 */
export async function requireStaff(): Promise<StaffCaller | null> {
  const session = await requireSession();
  if (!session) return null;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, active, department_id')
    .eq('id', session.userId)
    .maybeSingle();
  if (!profile?.active) return null;
  if (profile.role !== 'admin' && profile.role !== 'head' && profile.role !== 'secretary') return null;
  return { userId: session.userId, role: profile.role, departmentId: profile.department_id };
}

export interface ActiveCaller {
  userId: string;
  role: UserRole;
  departmentId: string | null;
  name: string;
}

/**
 * Any signed-in, ACTIVE account (faculty included). For paid features the
 * client asked faculty to have too — their own recordings and the AI
 * assistant — where every read still goes through RLS as the caller.
 */
export async function requireActive(): Promise<ActiveCaller | null> {
  const session = await requireSession();
  if (!session) return null;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, active, department_id, name')
    .eq('id', session.userId)
    .maybeSingle();
  if (!profile?.active) return null;
  return { userId: session.userId, role: profile.role, departmentId: profile.department_id, name: profile.name };
}
