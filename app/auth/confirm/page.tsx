'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { EmailOtpType } from '@supabase/supabase-js';
import { Logo } from '@/components/Logo';

function ConfirmInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<'working' | 'ok' | 'error'>('working');
  const [message, setMessage] = useState('Confirming your email…');

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    (async () => {
      const errDesc = params.get('error_description') || params.get('error');
      if (errDesc) {
        if (!active) return;
        setStatus('error');
        setMessage(decodeURIComponent(errDesc));
        return;
      }

      const token_hash = params.get('token_hash');
      const type = (params.get('type') || 'signup') as EmailOtpType;
      const code = params.get('code');

      try {
        if (token_hash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash, type });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (!window.location.hash.includes('access_token')) {
          throw new Error('missing_token');
        } else {
          await new Promise((r) => setTimeout(r, 400));
          const { data } = await supabase.auth.getSession();
          if (!data.session) throw new Error('missing_session');
        }

        // Confirming must not leave a session — otherwise / and /login send
        // the user to their role dashboard immediately.
        await supabase.auth.signOut();
        if (!active) return;
        router.replace('/login?verified=1');
      } catch {
        if (!active) return;
        setStatus('error');
        setMessage('This confirmation link is invalid or has expired. Request a new one from the sign-in page.');
      }
    })();

    return () => {
      active = false;
    };
  }, [params, router]);

  return (
    <div className="bg-background min-h-screen flex items-center justify-center p-gutter">
      <div className="w-full max-w-[460px]">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-primary-lg p-xl text-center">
          <Logo size={72} className="mx-auto mb-sm" />
          <h1 className="font-h2 text-h2 text-primary mb-md">Confirm your email</h1>
          {status === 'working' ? (
            <p className="font-body-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[28px] animate-pulse text-primary block mb-xs">
                progress_activity
              </span>
              {message}
            </p>
          ) : status === 'ok' ? (
            <div className="p-md bg-success-container border-l-4 border-success rounded-lg flex items-start gap-sm text-left">
              <span className="material-symbols-outlined text-success">mark_email_read</span>
              <p className="font-body-sm text-on-surface">{message}</p>
            </div>
          ) : (
            <div className="p-md bg-error-container text-error rounded-lg flex items-start gap-sm text-left">
              <span className="material-symbols-outlined">error</span>
              <p className="font-body-sm">{message}</p>
            </div>
          )}
          <Link
            href="/login"
            className="mt-lg inline-flex items-center justify-center w-full bg-primary text-on-primary font-semibold py-md rounded-lg"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense>
      <ConfirmInner />
    </Suspense>
  );
}
