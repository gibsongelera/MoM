'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { initials } from '@/lib/utils/initials';
import type { UserRole } from '@/lib/types/domain';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  position: string | null;
  department_id: string | null;
  joined_at: string | null;
  /** Role asked for at sign-up; grants nothing until an admin approves it. */
  requested_role: UserRole | null;
}

const ROLES: UserRole[] = ['admin', 'head', 'secretary', 'faculty'];

export default function UsersTable({
  users,
  departments,
}: {
  users: UserRow[];
  departments: { id: string; short: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deptShort = new Map(departments.map((d) => [d.id, d.short]));

  /**
   * Updates one profile and treats "0 rows changed" as a failure: RLS turns a
   * denied UPDATE into a silent no-op, which must not read as success.
   */
  async function updateProfile(user: UserRow, patch: Partial<Pick<UserRow, 'role' | 'active' | 'requested_role'>>) {
    setPendingId(user.id);
    setError(null);
    const { data, error: updateError } = await supabase.from('profiles').update(patch).eq('id', user.id).select('id');
    setPendingId(null);
    if (updateError || !data?.length) {
      setError(`Couldn't update ${user.name}. ${updateError?.message ?? 'You may not have permission to change this account.'}`);
      return;
    }
    router.refresh();
  }

  function toggleActive(user: UserRow) {
    void updateProfile(user, { active: !user.active });
  }

  function changeRole(user: UserRow, role: UserRole) {
    if (role === user.role) return;
    if (!window.confirm(`Change ${user.name}'s role from ${user.role} to ${role}?`)) return;
    void updateProfile(user, { role });
  }

  function approve(user: UserRow) {
    const role = user.requested_role ?? 'faculty';
    void updateProfile(user, { role, active: true, requested_role: null });
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
      {error ? <div role="alert" className="p-sm bg-error-container text-error font-body-sm">{error}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-body-sm">
          <thead className="bg-surface-container-low border-b border-outline-variant">
            <tr>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Name</th>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Role</th>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Department</th>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Status</th>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Joined</th>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-outline-variant hover:bg-surface-container-low">
                <td className="py-sm px-md">
                  <div className="flex items-center gap-sm">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                      {initials(u.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{u.name}</div>
                      <div className="font-caption text-on-surface-variant truncate">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="py-sm px-md">
                  <select
                    aria-label={`Role for ${u.name}`}
                    value={u.role}
                    disabled={pendingId === u.id}
                    onChange={(e) => changeRole(u, e.target.value as UserRole)}
                    className="capitalize rounded-lg border-outline-variant bg-surface-container text-body-sm py-1"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-sm px-md">{u.department_id ? (deptShort.get(u.department_id) ?? '—') : '—'}</td>
                <td className="py-sm px-md">
                  <span className={`pill ${u.active ? 'pill-done' : 'pill-overdue'}`}>{u.active ? 'Active' : 'Inactive'}</span>
                  {!u.active && u.requested_role ? (
                    <div className="font-caption text-on-surface-variant mt-xs">Requested: {u.requested_role}</div>
                  ) : null}
                </td>
                <td className="py-sm px-md text-on-surface-variant">{u.joined_at ?? ''}</td>
                <td className="py-sm px-md text-right whitespace-nowrap">
                  {!u.active && u.requested_role ? (
                    <button
                      type="button"
                      onClick={() => approve(u)}
                      disabled={pendingId === u.id}
                      className="mr-md text-primary hover:underline font-semibold disabled:opacity-50"
                    >
                      Approve as {u.requested_role}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => toggleActive(u)}
                    disabled={pendingId === u.id}
                    className="text-primary hover:underline font-semibold disabled:opacity-50"
                  >
                    {pendingId === u.id ? 'Saving...' : u.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}