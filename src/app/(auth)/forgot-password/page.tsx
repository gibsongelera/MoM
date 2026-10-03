'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/ui/Logo';

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: `${window.location.origin}/login`,
        },
      );
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setOk(
        `If ${email.trim().toLowerCase()} is registered, a password reset link will arrive within minutes.`,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background p-gutter flex items-center justify-center">
      <div className="w-full max-w-[480px]">
        <Link href="/login" className="inline-flex items-center gap-xs text-on-surface-variant hover:text-primary mb-md font-body-sm">
          Back to login
        </Link>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-primary-lg p-xl">
          <div className="text-center mb-lg">
            <Logo size={72} className="mx-auto mb-sm" alt="ZPPSU seal" priority />
            <h1 className="font-h2 text-h2 text-primary">Reset your password</h1>
            <p className="font-body-md text-on-surface-variant">
              Enter your institutional email and we&apos;ll send a reset link.
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
                required
                className="w-full px-md py-md bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0 rounded-lg"
                placeholder="user@zppsu.edu.ph"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {error ? (
              <div className="text-error bg-error-container p-sm rounded-lg font-body-sm">{error}</div>
            ) : null}
            {ok ? (
              <div className="text-success bg-success-container p-sm rounded-lg font-body-sm">{ok}</div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-on-primary font-body-md font-semibold py-md rounded-lg shadow-primary-md hover:opacity-90 transition disabled:opacity-60"
            >
              {loading ? 'Sending reset link...' : 'Send Reset Link'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
