'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    // Send via our own mailer route (Brevo SMTP), not Supabase's built-in email.
    // Always show the same confirmation so an attacker can't probe which emails exist.
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: addr }),
    }).catch(() => {});
    setSubmitted(addr);
  }

  return (
    <div className="bg-background min-h-screen flex items-center justify-center p-gutter">
      <div className="w-full max-w-[460px]">
        <Link
          href="/login"
          className="inline-flex items-center gap-xs text-on-surface-variant hover:text-primary mb-md font-body-sm"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span> Back to login
        </Link>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-primary-lg p-xl">
          <div className="text-center mb-lg">
            <div className="w-14 h-14 mx-auto rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant flex items-center justify-center mb-sm">
              <span className="material-symbols-outlined text-[28px]">lock_reset</span>
            </div>
            <h1 className="font-h2 text-h2 text-primary">Reset your password</h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
              Enter your institutional email and we&apos;ll send a reset link.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-md">
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface mb-xs">Institutional Email</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant">
                  mail
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-xl pr-md py-md bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0 rounded-lg"
                  placeholder="user@zppsu.edu.ph"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-primary text-on-primary font-body-md font-semibold py-md rounded-lg shadow-primary-md hover:opacity-90 transition flex items-center justify-center gap-sm"
            >
              Send Reset Link <span className="material-symbols-outlined">send</span>
            </button>
          </form>

          {submitted ? (
            <div className="mt-md p-md bg-success-container border-l-4 border-success rounded-lg flex items-start gap-sm">
              <span className="material-symbols-outlined text-success">mark_email_read</span>
              <div className="flex-1">
                <p className="font-body-sm font-semibold text-on-surface">Check your inbox</p>
                <p className="font-caption text-caption text-on-surface-variant mt-xs">
                  If <strong>{submitted}</strong> is registered, a secure password-reset link will arrive in
                  your inbox within a few minutes. The link opens a page to set a new password. Check your
                  spam folder if it doesn&apos;t appear.
                </p>
              </div>
            </div>
          ) : null}

          <p className="text-center font-body-sm text-on-surface-variant mt-lg">
            Remember your password?{' '}
            <Link href="/login" className="text-primary font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
