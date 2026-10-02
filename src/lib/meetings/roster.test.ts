import { describe, expect, it } from 'vitest';
import { buildRoster, quorum, walkIn, type AttendanceRecord } from './roster';

const participants = [
  { id: 'head', name: 'Engr. Ricardo Gomez', position: 'College Dean' },
  { id: 'fac', name: 'Prof. Juan Dela Cruz', position: 'Associate Professor' },
  { id: 'h2', name: 'Dr. Antonio Mendoza', position: 'College Dean (CET)' },
];

describe('buildRoster', () => {
  it('orders approver, chair, panel, adviser, participants, guests', () => {
    const roster = buildRoster({
      approverId: 'head',
      chairpersonName: 'Dr. External Chair',
      panel: [{ name: 'Dr. Antonio Mendoza', userId: 'h2' }, { name: 'Engr. Visiting Panelist', affiliation: 'WMSU' }],
      adviserName: 'Prof. Ana Reyes',
      participants,
      guests: [{ id: 'g1', name: 'Mr. Parent Observer' }],
    });
    expect(roster.map((r) => r.kind)).toEqual(['approver', 'chair', 'panel', 'panel', 'adviser', 'participant', 'guest']);
  });

  it('lists an account once even if it is both panelist and participant', () => {
    const roster = buildRoster({ panel: [{ name: 'Dr. Antonio Mendoza', userId: 'h2' }], participants });
    expect(roster.filter((r) => r.userId === 'h2')).toHaveLength(1);
    expect(roster.find((r) => r.userId === 'h2')?.kind).toBe('panel');
  });

  it('keeps presence and signatures when rebuilt', () => {
    const first = buildRoster({ participants, guests: [{ id: 'g1', name: 'Guest One' }] });
    const signed: AttendanceRecord[] = first.map((r) =>
      r.key === 'g:g1' ? { ...r, present: true, signatureDataUrl: 'data:image/png;base64,AAA', signedAt: 1 } : r,
    );
    const again = buildRoster({ participants, guests: [{ id: 'g1', name: 'Guest One' }], existing: signed });
    const guest = again.find((r) => r.key === 'g:g1');
    expect(guest?.present).toBe(true);
    expect(guest?.signatureDataUrl).toBe('data:image/png;base64,AAA');
  });

  it('keeps walk-ins added earlier', () => {
    const visitor = walkIn('  Ms.  Walk In ', 'DepEd');
    const roster = buildRoster({ participants: [], existing: [visitor] });
    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({ name: 'Ms. Walk In', kind: 'walk_in', present: true, role: 'DepEd' });
  });
});

describe('quorum', () => {
  it('needs a simple majority of expected attendees', () => {
    const roster = buildRoster({ participants }).map((r, i) => ({ ...r, present: i < 2 }));
    expect(quorum(roster)).toMatchObject({ present: 2, needed: 2, met: true });
  });
});
