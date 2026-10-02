import type { UserRole } from '@/lib/types/domain';

/**
 * Where a notification should take its recipient. Pure so it can be unit
 * tested; every target is a page that role can actually open.
 */
export function notificationHref(
  role: UserRole,
  type: string,
  meetingId: string | null | undefined,
): string | null {
  switch (type) {
    case 'meeting_invite':
    case 'meeting_update':
      if (role === 'secretary') return meetingId ? `/secretary/meetings/${meetingId}` : '/secretary/meetings';
      if (role === 'faculty') return '/faculty/my-meetings';
      if (role === 'head') return '/head/calendar';
      return '/admin/meetings';
    case 'approval':
      if (role === 'head') return '/head/approvals';
      if (role === 'secretary') return meetingId ? `/secretary/mom-editor?m=${meetingId}` : '/secretary/mom-editor';
      return null;
    case 'task':
      if (role === 'faculty') return '/faculty/my-tasks';
      if (role === 'head') return '/head/delegate';
      if (role === 'secretary') return '/secretary/transcript';
      return null;
    default:
      return null;
  }
}
