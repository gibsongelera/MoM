'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth';
import { ROLE_DASHBOARDS } from '@/lib/nav';
import { Logo } from '@/components/Logo';

const DEMO = [
  { label: 'Administrator', email: 'admin@zppsu.edu.ph', password: 'admin123' },
  { label: 'Head / Dean', email: 'president@zppsu.edu.ph', password: 'head123' },
  { label: 'Secretary', email: 'secretary@zppsu.edu.ph', password: 'sec123' },
  { label: 'Faculty', email: 'faculty@zppsu.edu.ph', password: 'fac123' },
];

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [resending, setResending] = useState(false);

  // If already logged in, send to role dashboard.
  useEffect(() => {
    if (params.get('verified') === '1') return;
    if (!loading && user) router.replace(ROLE_DASHBOARDS[user.role] || '/login');
  }, [user, loading, router, params]);

  useEffect(() => {
    if (params.get('verified') === '1') {
      setInfo('Email confirmed. Sign in with your password.');
      void createClient().auth.signOut();
    }
  }, [params]);

  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setNeedsConfirm(false);
    setSubmitting(true);
    const res = await login(email, password);
    setSubmitting(false);
    if (!res.ok || !res.user) {
      setNeedsConfirm(res.code === 'email_not_confirmed');
      setError(res.error || 'Invalid credentials. Try one of the demo accounts below.');
      return;
    }
    router.replace(ROLE_DASHBOARDS[res.user.role] || '/login');
  }

  async function resendConfirmation() {
    const addr = email.trim();
    if (!addr || resending) return;
    setResending(true);
    await fetch('/api/auth/resend-confirmation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: addr }),
    }).catch(() => {});
    setResending(false);
    setInfo('If that address is registered, a new confirmation link is on the way.');
    setError('');
  }

  return (
    <div className="bg-background min-h-screen flex">
      <div className="flex w-full min-h-screen">
        {/* Left form */}
        <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-gutter relative z-10">
          <div className="w-full max-w-[480px] bg-surface-container-lowest/90 backdrop-blur-md rounded-xl border border-outline-variant shadow-primary-lg p-xl">
            <div className="mb-lg text-center">
              <div className="flex flex-col items-center justify-center mb-md gap-sm">
                <Logo size={96} />
                <h1 className="font-h2 text-h2 text-primary">ZPPSU SmartMin</h1>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Institutional Governance &amp; AI Assistant
              </p>
            </div>

            <div className="flex justify-center mb-lg">
              <span className="ai-badge">
                <span className="material-symbols-outlined text-[14px]">auto_awesome</span> Secure
                Institutional Login
              </span>
            </div>

            <form onSubmit={onSubmit} className="space-y-md">
              <div>
                <label className="block font-label-caps text-label-caps text-on-surface mb-xs" htmlFor="email">
                  Institutional Email
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant">
                    mail
                  </span>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-xl pr-md py-md bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0 rounded-lg font-body-md transition-colors"
                    placeholder="user@zppsu.edu.ph"
                  />
                </div>
              </div>
              <div>
                <label className="block font-label-caps text-label-caps text-on-surface mb-xs" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant">
                    lock
                  </span>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-xl pr-md py-md bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0 rounded-lg font-body-md transition-colors"
                    placeholder="••••••••"
                  />
                </div>
              </div>
              {info ? (
                <div className="text-on-surface font-body-sm bg-success-container p-sm rounded-lg flex items-center gap-xs">
                  <span className="material-symbols-outlined text-success">mark_email_read</span> {info}
                </div>
              ) : null}
              {error ? (
                <div className="text-error font-body-sm bg-error-container p-sm rounded-lg">
                  <div className="flex items-center gap-xs">
                    <span className="material-symbols-outlined text-[18px]">error</span> {error}
                  </div>
                  {needsConfirm ? (
                    <button
                      type="button"
                      onClick={resendConfirmation}
                      disabled={resending}
                      className="mt-sm font-semibold text-primary hover:underline disabled:opacity-60"
                    >
                      {resending ? 'Sending…' : 'Resend confirmation email'}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="flex items-center justify-between mt-sm">
                <label className="flex items-center gap-xs cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4"
                  />
                  <span className="font-body-sm text-body-sm text-on-surface-variant">Remember Me</span>
                </label>
                <Link className="font-body-sm text-body-sm text-primary hover:underline" href="/forgot-password">
                  Forgot Password?
                </Link>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary text-on-primary font-body-md font-semibold py-md rounded-lg shadow-primary-md hover:opacity-90 transition flex items-center justify-center gap-sm disabled:opacity-60"
              >
                {submitting ? 'Signing in…' : 'Login'} <span className="material-symbols-outlined">login</span>
              </button>
              <p className="text-center font-body-sm text-on-surface-variant">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="text-primary font-semibold hover:underline">
                  Register
                </Link>
              </p>
            </form>

            {/* Demo accounts quick-fill */}
            <div className="mt-lg p-md bg-surface-container rounded-lg border border-outline-variant">
              <h4 className="font-label-caps text-label-caps text-on-surface mb-sm flex items-center gap-xs">
                <span className="material-symbols-outlined text-[16px] text-tertiary-container">badge</span>{' '}
                 Demo Accounts
              </h4>
              <div className="grid grid-cols-2 gap-xs">
                {DEMO.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    onClick={() => {
                      setEmail(d.email);
                      setPassword(d.password);
                    }}
                    className="text-left p-sm rounded-lg bg-surface-container-lowest border border-outline-variant hover:border-primary transition-colors"
                  >
                    <div className="font-body-sm font-semibold text-primary">{d.label}</div>
                    <div className="font-caption text-caption text-on-surface-variant truncate">{d.email}</div>
                  </button>
                ))}
              </div>
              <p className="font-caption text-caption text-on-surface-variant mt-sm">
                Passwords are role-prefixed:{' '}
                <code className="bg-surface-container-low px-xs rounded">
                  admin123 / head123 / sec123 / fac123
                </code>
              </p>
            </div>
          </div>
          <p className="font-caption text-caption text-on-surface-variant mt-md">
            © 2026 Zamboanga Peninsula Polytechnic State University
          </p>
        </div>

        {/* Right brand panel */}
        <div className="hidden lg:flex w-1/2 relative overflow-hidden bg-gradient-to-br from-primary to-primary-container items-center justify-center p-xl">
          <div
            className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}
          />
          <div className="relative z-10 max-w-[480px] text-on-primary">
            <span className="ai-badge mb-md">
              <span className="material-symbols-outlined text-[14px]">memory</span> Cloud AI · Real-time
              Transcription
            </span>
            <h2 className="font-display text-display mb-md">Intelligent Governance.</h2>
            <p className="font-body-lg text-body-lg opacity-90 mb-lg">
              Streamlining institutional meetings, automated transcriptions, and smart task delegation for
              ZPPSU.
            </p>
            <div className="grid grid-cols-2 gap-md">
              {[
                ['98%', 'Transcription Accuracy'],
                ['24hrs', 'Saved per Month'],
                ['EN+TL', 'Bilingual AI'],
                ['AI', 'Grounded Answers'],
              ].map(([big, small]) => (
                <div key={small} className="bg-white/10 backdrop-blur-sm rounded-lg p-md border border-white/20">
                  <p className="font-h2 text-h2 font-bold">{big}</p>
                  <p className="font-caption text-caption opacity-80">{small}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
