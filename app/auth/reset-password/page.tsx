'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { EmailOtpType } from '@supabase/supabase-js';

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false); // a recovery session is established
  const [verifying, setVerifying] = useState(true);

  // Establish a session from whatever recovery-link format Supabase used:
  //   • token_hash + type  → verifyOtp   (works cross-device / admin-initiated)
  //   • code               → exchangeCodeForSession (same device that requested)
  //   • #access_token=…     → handled automatically by detectSessionInUrl
  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && active) {
        setReady(true);
        setVerifying(false);
      }
    });

    (async () => {
      const errDesc = params.get('error_description') || params.get('error');
      if (errDesc) {
        setError(decodeURIComponent(errDesc));
        setVerifying(false);
        return;
      }
      const token_hash = params.get('token_hash');
      const type = (params.get('type') || 'recovery') as EmailOtpType;
      const code = params.get('code');
      try {
        if (token_hash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash, type });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        // Give detectSessionInUrl (implicit #access_token flow) a beat to run,
        // then confirm we actually have a session.
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        if (data.session) {
          setReady(true);
          setVerifying(false);
        } else if (!token_hash && !code && !window.location.hash.includes('access_token')) {
          setError('This reset link is invalid or has expired. Please request a new one.');
          setVerifying(false);
        }
        // else: wait for onAuthStateChange from the hash flow.
      } catch {
        if (active) {
          setError('This reset link is invalid or has expired. Please request a new one.');
          setVerifying(false);
        }
      }
    })();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [params]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== password2) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    const { error } = await createClient().auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setError(
        /session/i.test(error.message)
          ? 'Your reset link has expired. Please request a new one from the Forgot Password page.'
          : error.message || 'Could not reset password.',
      );
      return;
    }
    setDone(true);
    setTimeout(() => router.replace('/login'), 1800);
  }

  return (
    <div className="bg-background min-h-screen flex items-center justify-center p-gutter">
      <div className="w-full max-w-[460px]">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-primary-lg p-xl">
          <div className="text-center mb-lg">
            <div className="w-14 h-14 mx-auto rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant flex items-center justify-center mb-sm">
              <span className="material-symbols-outlined text-[28px]">lock_reset</span>
            </div>
            <h1 className="font-h2 text-h2 text-primary">Set a new password</h1>
          </div>

          {done ? (
            <div className="p-md bg-success-container border-l-4 border-success rounded-lg flex items-start gap-sm">
              <span className="material-symbols-outlined text-success">check_circle</span>
              <p className="font-body-sm text-on-surface">Password updated. Redirecting to sign in…</p>
            </div>
          ) : verifying ? (
            <div className="p-md text-center text-on-surface-variant">
              <span className="material-symbols-outlined text-[28px] animate-pulse text-primary block mb-xs">progress_activity</span>
              <p className="font-body-sm">Verifying your reset link…</p>
            </div>
          ) : !ready ? (
            <div className="space-y-md">
              <div className="text-error font-body-sm bg-error-container p-sm rounded-lg flex items-center gap-xs">
                <span className="material-symbols-outlined text-[18px]">error</span> {error || 'This reset link is invalid or has expired.'}
              </div>
              <Link href="/forgot-password" className="block text-center bg-primary text-on-primary font-semibold py-md rounded-lg">
                Request a new link
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-md">
              <div>
                <label className="block font-label-caps text-label-caps text-on-surface mb-xs">New Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-md py-md bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0 rounded-lg"
                  placeholder="At least 6 characters"
                />
              </div>
              <div>
                <label className="block font-label-caps text-label-caps text-on-surface mb-xs">Confirm Password</label>
                <input
                  type="password"
                  required
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  className="w-full px-md py-md bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0 rounded-lg"
                  placeholder="Repeat password"
                />
              </div>
              {error ? (
                <div className="text-error font-body-sm bg-error-container p-sm rounded-lg flex items-center gap-xs">
                  <span className="material-symbols-outlined text-[18px]">error</span> {error}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary text-on-primary font-body-md font-semibold py-md rounded-lg shadow-primary-md hover:opacity-90 transition disabled:opacity-60"
              >
                {submitting ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          )}

          <p className="text-center font-body-sm text-on-surface-variant mt-lg">
            <Link href="/login" className="text-primary font-semibold hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordInner />
    </Suspense>
  );
}
