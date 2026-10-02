'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ROLE_DASHBOARDS } from '@/lib/nav';
import { Logo } from '@/components/Logo';
import type { Role } from '@/lib/types';

interface DeptOption { id: string; short: string; name: string }

export default function RegisterPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [departments, setDepartments] = useState<DeptOption[]>([]);

  const [form, setForm] = useState({
    name: '',
    email: '',
    position: '',
    role: 'faculty' as Role,
    departmentId: '',
    password: '',
    password2: '',
  });
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [awaitingEmail, setAwaitingEmail] = useState('');
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(ROLE_DASHBOARDS[user.role] || '/login');
  }, [user, loading, router]);

  // Departments come from a public API route (RLS hides them from anon).
  useEffect(() => {
    fetch('/api/departments')
      .then((r) => r.json())
      .then((d) => setDepartments(d.departments || []))
      .catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    if (departments.length && !form.departmentId) {
      setForm((f) => ({ ...f, departmentId: departments[0].id }));
    }
  }, [departments, form.departmentId]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setPending('');
    if (form.password !== form.password2) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        position: form.position.trim(),
        role: form.role,
        departmentId: form.departmentId,
        password: form.password,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok && !data.needsConfirmation) {
      setError(data.error || 'Registration failed. Please try again.');
      return;
    }

    setAwaitingEmail(form.email.trim().toLowerCase());
    if (!data.active) {
      setPending(
        'We sent a confirmation link to your email. After you confirm, an administrator must approve this account before you can sign in.',
      );
      return;
    }
    setPending(
      data.emailSent === false
        ? 'Account created, but the email may not have sent. Use Resend below, then sign in after confirming.'
        : 'We sent a confirmation link to your email. Confirm it, then sign in — you cannot log in until then.',
    );
  }

  async function resendConfirmation() {
    if (!awaitingEmail || resending) return;
    setResending(true);
    setError('');
    await fetch('/api/auth/resend-confirmation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: awaitingEmail }),
    }).catch(() => {});
    setResending(false);
    setPending('If that inbox can receive mail, another confirmation link is on the way.');
  }

  const inputCls =
    'w-full px-md py-md bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0 rounded-lg';

  return (
    <div className="bg-background min-h-screen flex items-center justify-center p-gutter">
      <div className="w-full max-w-[640px]">
        <Link
          href="/"
          className="inline-flex items-center gap-xs text-on-surface-variant hover:text-primary mb-md font-body-sm"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span> Back to home
        </Link>

        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-primary-lg p-xl">
          <div className="text-center mb-lg">
            <div className="mx-auto mb-sm">
              <Logo size={80} className="mx-auto" />
            </div>
            <h1 className="font-h1 text-h1 text-primary">Create your account</h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
              Join the ZPPSU SmartMin institutional platform.
            </p>
          </div>

          <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div className="md:col-span-2">
              <label className="block font-label-caps text-label-caps text-on-surface mb-xs">Full Name</label>
              <input required value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} placeholder="Dr. Juan Dela Cruz" />
            </div>
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface mb-xs">Institutional Email</label>
              <input type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} placeholder="user@zppsu.edu.ph" />
            </div>
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface mb-xs">Position / Designation</label>
              <input value={form.position} onChange={(e) => set('position', e.target.value)} className={inputCls} placeholder="Associate Professor" />
            </div>
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface mb-xs">Role</label>
              <select required value={form.role} onChange={(e) => set('role', e.target.value as Role)} className={inputCls}>
                <option value="faculty">Faculty</option>
                <option value="secretary">Secretary</option>
                <option value="head">Head / President</option>
                <option value="admin">System Administrator (requires approval)</option>
              </select>
            </div>
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface mb-xs">Department / Office</label>
              <select required value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)} className={inputCls}>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.short} - {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface mb-xs">Password</label>
              <input type="password" required minLength={6} value={form.password} onChange={(e) => set('password', e.target.value)} className={inputCls} placeholder="At least 6 characters" />
            </div>
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface mb-xs">Confirm Password</label>
              <input type="password" required value={form.password2} onChange={(e) => set('password2', e.target.value)} className={inputCls} placeholder="Repeat password" />
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center gap-xs">
                <input type="checkbox" required className="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4" />
                <span className="font-body-sm text-on-surface-variant">
                  I agree to ZPPSU&apos;s{' '}
                  <a href="#" className="text-primary hover:underline">
                    Privacy &amp; Data Handling Policy
                  </a>{' '}
                  and consent to AI processing of meeting data.
                </span>
              </label>
            </div>
            {error ? (
              <div className="md:col-span-2 text-error bg-error-container p-sm rounded-lg font-body-sm flex items-center gap-xs">
                <span className="material-symbols-outlined text-[18px]">error</span> {error}
              </div>
            ) : null}
            {pending ? (
              <div className="md:col-span-2 text-tertiary-container bg-tertiary-fixed p-sm rounded-lg font-body-sm flex items-start gap-xs">
                <span className="material-symbols-outlined text-[18px]">mark_email_unread</span>
                <div className="flex-1">
                  <p>{pending}</p>
                  {awaitingEmail ? (
                    <button
                      type="button"
                      onClick={resendConfirmation}
                      disabled={resending}
                      className="mt-sm text-primary font-semibold hover:underline disabled:opacity-60"
                    >
                      {resending ? 'Sending…' : 'Resend confirmation email'}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="md:col-span-2 bg-primary text-on-primary font-body-md font-semibold py-md rounded-lg shadow-primary-md hover:opacity-90 transition flex items-center justify-center gap-sm disabled:opacity-60"
            >
              {submitting ? 'Creating…' : 'Create Account'} <span className="material-symbols-outlined">arrow_forward</span>
            </button>
            <p className="md:col-span-2 text-center font-body-sm text-on-surface-variant">
              Already have an account?{' '}
              <Link href="/login" className="text-primary font-semibold hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
