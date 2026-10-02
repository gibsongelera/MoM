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

  async function toggleActive(user: UserRow) {
    setPendingId(user.id);
    setError(null);
    const { error: updateError } = await supabase.from('profiles').update({ active: !user.active }).eq('id', user.id);
    setPendingId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  async function changeRole(user: UserRow, role: UserRole) {
    if (role === user.role) return;
    setPendingId(user.id);
    setError(null);
    const { error: updateError } = await supabase.from('profiles').update({ role }).eq('id', user.id);
    setPendingId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
      {error ? <div className="p-sm bg-error-container text-error font-body-sm">{error}</div> : null}
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
                </td>
                <td className="py-sm px-md text-on-surface-variant">{u.joined_at ?? ''}</td>
                <td className="py-sm px-md text-right">
                  <button
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