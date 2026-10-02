import { describe, expect, it } from 'vitest';
import { notificationHref } from './links';

describe('notificationHref', () => {
  it('sends a secretary to the meeting hub for invitations', () => {
    expect(notificationHref('secretary', 'meeting_invite', 'm1')).toBe('/secretary/meetings/m1');
  });

  it('never sends faculty to a secretary-only page', () => {
    for (const type of ['meeting_invite', 'meeting_update', 'approval', 'task', 'other']) {
      const href = notificationHref('faculty', type, 'm1');
      expect(href === null || href.startsWith('/faculty')).toBe(true);
    }
  });

  it('routes approvals to the head approvals queue', () => {
    expect(notificationHref('head', 'approval', 'm1')).toBe('/head/approvals');
  });

  it('returns null for unknown types', () => {
    expect(notificationHref('admin', 'info', null)).toBeNull();
  });
});
