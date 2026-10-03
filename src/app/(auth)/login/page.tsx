'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ROLE_DASHBOARDS, type UserRole } from '@/lib/types/domain';
import { safeNextPath } from '@/lib/auth/safe-next';
import { Logo } from '@/components/ui/Logo';

type DemoAccount = {
  label: string;
  email: string;
};

/*
 * Quick-fill for the defense demo. Emails only: passwords are never shipped in
 * the client bundle (this repo is public). Shown only when the deployment opts
 * in with NEXT_PUBLIC_DEMO_LOGINS=1.
 */
const SHOW_DEMO_ACCOUNTS = process.env.NEXT_PUBLIC_DEMO_LOGINS === '1';
const DEMO_ACCOUNTS: DemoAccount[] = [
  { label: 'Administrator', email: 'admin@zppsu.edu.ph' },
  { label: 'Head', email: 'president@zppsu.edu.ph' },
  { label: 'Secretary', email: 'secretary@zppsu.edu.ph' },
  { label: 'Faculty', email: 'faculty@zppsu.edu.ph' },
];

const REASON_MESSAGES: Record<string, string> = {
  inactive: "This account isn't active yet. An administrator needs to approve it before you can sign in.",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(() => REASON_MESSAGES[params.get('reason') ?? ''] ?? null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }

      const userId = data.user?.id;
      let role: UserRole | null = null;
      if (userId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('active, role')
          .eq('id', userId)
          .maybeSingle();
        if (profile?.active === false) {
          await supabase.auth.signOut();
          setError(REASON_MESSAGES.inactive);
          return;
        }
        role = profile?.role ?? null;
      }

      // Honor an explicit redirect target (set when the proxy bounced an
      // unauthenticated visit to a protected page); otherwise go straight to
      // this user's own dashboard rather than the public landing page.
      const destination = safeNextPath(params.get('next')) ?? ((role && ROLE_DASHBOARDS[role]) || '/');
      router.push(destination);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background p-gutter flex items-center justify-center">
      <div className="w-full max-w-[480px] bg-surface-container-lowest rounded-xl border border-outline-variant shadow-primary-lg p-xl">
        <div className="text-center mb-lg">
          <Logo size={88} className="mx-auto mb-sm" alt="" priority />
          <h1 className="font-h2 text-h2 text-primary">ZPPSU SmartMin Login</h1>
          <p className="font-body-md text-on-surface-variant">
            Institutional Governance and AI Assistant
          </p>
        </div>

        <form className="space-y-md" onSubmit={onSubmit}>
          <div>
            <label className="block font-label-caps text-on-surface mb-xs" htmlFor="email">
              Institutional Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              className="w-full px-md py-md bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0 rounded-lg"
              placeholder="user@zppsu.edu.ph"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block font-label-caps text-on-surface mb-xs" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full px-md py-md bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0 rounded-lg"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error ? (
            <div role="alert" className="text-error font-body-sm bg-error-container p-sm rounded-lg">{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary font-body-md font-semibold py-md rounded-lg shadow-primary-md hover:opacity-90 transition disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Login'}
          </button>

          <p className="text-center font-body-sm text-on-surface-variant">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-primary font-semibold hover:underline">
              Register
            </Link>
          </p>
          <p className="text-center font-body-sm text-on-surface-variant">
            <Link href="/forgot-password" className="text-primary hover:underline">
              Forgot Password?
            </Link>
          </p>
        </form>

        {SHOW_DEMO_ACCOUNTS ? (
          <div className="mt-lg p-md bg-surface-container rounded-lg border border-outline-variant">
            <h2 className="font-label-caps text-label-caps text-on-surface mb-sm">Demo accounts</h2>
            <div className="grid grid-cols-2 gap-xs">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    document.getElementById('password')?.focus();
                  }}
                  className="text-left p-sm rounded-lg bg-surface-container-lowest border border-outline-variant hover:border-primary transition-colors"
                >
                  <div className="font-body-sm font-semibold text-primary">{a.label}</div>
                  <div className="font-caption text-on-surface-variant truncate">{a.email}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

/**
 * useSearchParams() (read inside LoginForm, for the post-login `?next=`
 * redirect) requires a Suspense boundary for Next.js to statically prerender
 * this route — otherwise `next build` fails outright. The fallback is
 * transient (hydration only) and intentionally minimal.
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-gutter flex items-center justify-center">
          <div className="w-full max-w-[480px] bg-surface-container-lowest rounded-xl border border-outline-variant shadow-primary-lg p-xl text-center font-body-md text-on-surface-variant">
            Loading...
          </div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
