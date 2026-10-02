'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Department = { id: string; name: string; short: string };

export default function RegisterPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [role, setRole] = useState<'faculty' | 'secretary' | 'head' | 'admin'>('faculty');
  const [departmentId, setDepartmentId] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Signed-out visitors cannot read the departments table; this definer
      // RPC exposes only id/name/short for the picker.
      const { data, error } = await supabase.rpc('list_departments_public');
      if (!alive) return;
      if (error) {
        setError("We couldn't load the list of departments. Refresh the page to try again.");
        return;
      }
      const rows = ((data ?? []) as Department[]).sort((a, b) => a.short.localeCompare(b.short));
      setDepartments(rows);
      if (rows[0]) setDepartmentId(rows[0].id);
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (password.length < 8) {
      setError('Use a password of at least 8 characters.');
      return;
    }
    if (password !== password2) {
      setError('Passwords do not match.');
      return;
    }
    if (!departmentId) {
      setError('Please select a department.');
      return;
    }

    setLoading(true);
    try {
      // Every self-registered account starts as inactive faculty (enforced by
      // the handle_new_user trigger). `role` is only a request an
      // administrator reviews in User Management.
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            name: name.trim(),
            role,
            position: position.trim(),
            department_id: departmentId,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      // Sign-up may open a session; the account can't use it until approved.
      await supabase.auth.signOut();
      setOk("Account created. An administrator will review your request — you can sign in once it's approved.");
      setTimeout(() => {
        router.push('/login');
      }, 4000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background p-gutter flex items-center justify-center">
      <div className="w-full max-w-[700px] bg-surface-container-lowest rounded-xl border border-outline-variant shadow-primary-lg p-xl">
        <div className="text-center mb-lg">
          <h1 className="font-h1 text-h1 text-primary">Create your account</h1>
          <p className="font-body-md text-on-surface-variant">
            Join the ZPPSU SmartMin institutional platform.
          </p>
        </div>

        <form className="grid grid-cols-1 md:grid-cols-2 gap-md" onSubmit={onSubmit}>
          <div className="md:col-span-2">
            <label className="block font-label-caps text-on-surface mb-xs" htmlFor="name">
              Full Name
            </label>
            <input
              id="name"
              required
              className="w-full px-md py-md bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0 rounded-lg"
              placeholder="Dr. Juan Dela Cruz"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
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
          <div>
            <label className="block font-label-caps text-on-surface mb-xs" htmlFor="position">
              Position / Designation
            </label>
            <input
              id="position"
              className="w-full px-md py-md bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0 rounded-lg"
              placeholder="Associate Professor"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </div>
          <div>
            <label className="block font-label-caps text-on-surface mb-xs" htmlFor="role">
              Requested role
            </label>
            <select
              id="role"
              required
              className="w-full px-md py-md bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0 rounded-lg"
              value={role}
              onChange={(e) => setRole(e.target.value as 'faculty' | 'secretary' | 'head' | 'admin')}
            >
              <option value="faculty">Faculty</option>
              <option value="secretary">Secretary</option>
              <option value="head">Head</option>
              <option value="admin">System Administrator</option>
            </select>
          </div>
          <div>
            <label className="block font-label-caps text-on-surface mb-xs" htmlFor="department">
              Department / Office
            </label>
            <select
              id="department"
              required
              className="w-full px-md py-md bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0 rounded-lg"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.short} - {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-label-caps text-on-surface mb-xs" htmlFor="pw1">
              Password
            </label>
            <input
              id="pw1"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full px-md py-md bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0 rounded-lg"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="block font-label-caps text-on-surface mb-xs" htmlFor="pw2">
              Confirm Password
            </label>
            <input
              id="pw2"
              type="password"
              autoComplete="new-password"
              required
              className="w-full px-md py-md bg-surface-container-low border-2 border-transparent focus:border-primary focus:ring-0 rounded-lg"
              placeholder="Repeat password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
            />
          </div>

          {error ? (
            <div role="alert" className="md:col-span-2 text-error bg-error-container p-sm rounded-lg font-body-sm">
              {error}
            </div>
          ) : null}
          {ok ? (
            <div role="status" className="md:col-span-2 text-success bg-success-container p-sm rounded-lg font-body-sm">
              {ok}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="md:col-span-2 bg-primary text-on-primary font-body-md font-semibold py-md rounded-lg shadow-primary-md hover:opacity-90 transition disabled:opacity-60"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
          <p className="md:col-span-2 text-center font-body-sm text-on-surface-variant">
            Already have an account?{' '}
            <Link href="/login" className="text-primary font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
