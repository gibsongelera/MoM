'use client';

// Real auth/session over Supabase Auth. Keeps the same public surface the app
// already uses (useAuth / useCurrentUser / useRequireRole / AppProvider) so no
// page needs to change how it reads the current user. Credentials live in
// Supabase Auth; the app-level user is the matching `profiles` row.

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { mapUser, logAudit } from './db';
import { signedAvatarUrl } from './storage';
import { ROLE_DASHBOARDS } from './nav';
import type { Role, User } from './types';

/** Map a profile row and resolve its avatar to a signed URL for the topbar. */
async function resolveUser(row: unknown): Promise<User> {
  const u = mapUser(row as Record<string, unknown>);
  if (u.photoPath) {
    try {
      u.photoDataUrl = await signedAvatarUrl(u.photoPath);
    } catch {
      /* non-essential */
    }
  }
  return u;
}

interface LoginResult { ok: boolean; error?: string; user?: User; code?: string }

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (u: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUserState] = useState<User | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  // Track the Supabase session; the profile is loaded in the effect below.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setSessionUserId(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Resolve the app user from the profiles row whenever the session changes.
  useEffect(() => {
    if (sessionUserId === undefined) return; // still resolving initial session
    if (sessionUserId === null) {
      setUserState(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from('profiles').select('*').eq('id', sessionUserId).single();
      if (cancelled) return;
      setUserState(data ? await resolveUser(data) : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

  const setUser = useCallback((u: User | null) => setUserState(u), []);

  const refreshUser = useCallback(async () => {
    const supabase = createClient();
    const { data: sess } = await supabase.auth.getSession();
    const id = sess.session?.user?.id;
    if (!id) {
      setUserState(null);
      return;
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', id).single();
    setUserState(data ? await resolveUser(data) : null);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error || !data.user) {
      const msg = error?.message || 'Invalid email or password.';
      if (/not confirmed|email not confirmed/i.test(msg)) {
        return {
          ok: false,
          code: 'email_not_confirmed',
          error: 'Please confirm your email first. Check your inbox for the verification link.',
        };
      }
      return { ok: false, error: msg };
    }
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
    if (!profile) return { ok: false, error: 'No profile is linked to this account.' };
    if (profile.active === false) {
      await supabase.auth.signOut();
      return { ok: false, error: 'This account is inactive. Please contact your administrator.' };
    }
    const mapped = await resolveUser(profile);
    setUserState(mapped);
    setSessionUserId(data.user.id);
    void logAudit('login', `${mapped.name} signed in`);
    return { ok: true, user: mapped };
  }, []);

  const logout = useCallback(async () => {
    void logAudit('logout', 'User logged out');
    const supabase = createClient();
    await supabase.auth.signOut();
    setUserState(null);
    setSessionUserId(null);
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AppProvider>');
  return ctx;
}

export function useCurrentUser(): User | null {
  return useAuth().user;
}

/**
 * Client-side page guard. Redirects to /login when signed out, or to the user's
 * own dashboard when their role doesn't match `requiredRole`. RLS is the real
 * boundary; this only keeps the wrong shell from rendering.
 */
export function useRequireRole(requiredRole?: Role): { user: User | null; ready: boolean } {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (requiredRole && user.role !== requiredRole) {
      router.replace(ROLE_DASHBOARDS[user.role] || '/login');
    }
  }, [user, loading, requiredRole, router]);

  const ready = !loading && !!user && (!requiredRole || user.role === requiredRole);
  return { user, ready };
}
