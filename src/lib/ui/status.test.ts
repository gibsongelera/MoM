import { describe, expect, it } from 'vitest';
import { MEETING_STATUS, humanize, meetingStatus, meetingType } from './status';

describe('status map', () => {
  it('labels every meeting status in sentence case', () => {
    for (const spec of Object.values(MEETING_STATUS)) {
      expect(spec.label[0]).toBe(spec.label[0].toUpperCase());
      expect(spec.pill.startsWith('pill-')).toBe(true);
    }
  });

  it('never shows pending approval as neutral grey and archived as an error', () => {
    expect(meetingStatus('pending_approval').pill).toBe('pill-progress');
    expect(meetingStatus('archived').pill).not.toBe('pill-overdue');
  });

  it('degrades gracefully for unknown values', () => {
    expect(meetingStatus('some_new_state')).toEqual({ label: 'Some new state', pill: 'pill-pending' });
    expect(meetingType('unknown').label).toBe('Regular');
  });

  it('humanizes every underscore', () => {
    expect(humanize('a_b_c')).toBe('A b c');
    expect(humanize(null)).toBe('');
  });
});
