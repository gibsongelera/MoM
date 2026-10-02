// Pure, in-memory scope filters — the client-side convenience mirror of the
// RLS rules in supabase/migrations/0002_rls.sql. RLS is the real access
// boundary; these just shape already-fetched collections for the UI (admin
// fetches everything, then narrows). Ported from the helpers that used to live
// in lib/store.ts.

import type { Meeting, PersonalMeeting, Task, User } from './types';

type Scoped = { role: string; departmentId: string; id: string };

export function scopeMeetings(user: Scoped | null, meetings: Meeting[]): Meeting[] {
  if (!user) return [];
  if (user.role === 'admin') return meetings;
  if (user.role === 'head') return meetings.filter((m) => m.departmentId === user.departmentId);
  if (user.role === 'secretary')
    return meetings.filter((m) => m.departmentId === user.departmentId || m.secretaryId === user.id);
  if (user.role === 'faculty')
    return meetings.filter(
      (m) => (m.participantIds || []).includes(user.id) || m.departmentId === user.departmentId,
    );
  return [];
}

export function scopeTasks(user: Scoped | null, tasks: Task[]): Task[] {
  if (!user) return [];
  if (user.role === 'admin') return tasks;
  if (user.role === 'head') return tasks.filter((t) => t.departmentId === user.departmentId);
  if (user.role === 'secretary') return tasks.filter((t) => t.departmentId === user.departmentId);
  if (user.role === 'faculty') return tasks.filter((t) => t.assigneeId === user.id);
  return [];
}

export function scopeUsers(user: Scoped | null, users: User[]): User[] {
  if (!user) return [];
  if (user.role === 'admin') return users;
  if (user.role === 'head' || user.role === 'secretary')
    return users.filter((u) => u.departmentId === user.departmentId);
  return users.filter((u) => u.id === user.id);
}

export function scopePersonalMeetings(user: Scoped | null, items: PersonalMeeting[]): PersonalMeeting[] {
  if (!user) return [];
  if (user.role === 'admin') return items;
  return items.filter((p) => p.userId === user.id);
}

/** Dashboard KPI aggregation over already-fetched, RLS-scoped collections. */
export function statsFor(
  user: Scoped | null,
  data: { meetings: Meeting[]; tasks: Task[]; users: User[] },
) {
  const m = scopeMeetings(user, data.meetings);
  const t = scopeTasks(user, data.tasks);
  const u = scopeUsers(user, data.users);
  const now = new Date();
  const thisMonth = m.filter((x) => {
    const d = new Date(x.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  return {
    totalUsers: u.length,
    activeUsers: u.filter((x) => x.active !== false).length,
    totalMeetings: m.length,
    meetingsThisMonth: thisMonth.length,
    pendingApprovals: m.filter((x) => x.status === 'pending_approval').length,
    pendingTasks: t.filter((x) => x.status === 'pending').length,
    tasksInProgress: t.filter((x) => x.status === 'in_progress').length,
    tasksDone: t.filter((x) => x.status === 'done').length,
    aiHoursSaved:
      Math.round(
        m.filter((x) => x.aiProcessed).reduce((s, x) => s + ((x.durationMin || 30) * 0.8) / 60, 0) *
          10,
      ) / 10,
  };
}
