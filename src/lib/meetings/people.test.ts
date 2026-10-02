import { describe, expect, it } from 'vitest';
import { cleanGuests, cleanPanel, normalizeName, validatePeople } from './people';

describe('normalizeName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeName('  Engr.   Ana   Cruz ')).toBe('Engr. Ana Cruz');
    expect(normalizeName(null)).toBe('');
  });
});

describe('cleanGuests', () => {
  it('drops blank rows and case-insensitive duplicates', () => {
    const out = cleanGuests([
      { id: '1', name: 'Ana Cruz' },
      { id: '2', name: '   ' },
      { id: '3', name: 'ana  cruz', affiliation: 'WMSU' },
      { id: '4', name: 'Ben Lim', affiliation: '  ' },
    ]);
    expect(out).toEqual([{ id: '1', name: 'Ana Cruz' }, { id: '4', name: 'Ben Lim' }]);
  });
});

describe('cleanPanel', () => {
  it('keeps typed external panelists and prefers the linked account on duplicates', () => {
    const out = cleanPanel([
      { name: 'Dr. External Panelist', affiliation: 'WMSU' },
      { name: 'Dr. Antonio Mendoza' },
      { name: 'dr. antonio  mendoza', userId: 'u-h2' },
      { name: '' },
    ]);
    expect(out).toEqual([
      { name: 'Dr. External Panelist', affiliation: 'WMSU' },
      { name: 'dr. antonio mendoza', userId: 'u-h2' },
    ]);
  });
});

describe('validatePeople', () => {
  it('flags an oversized panel only for capstone meetings', () => {
    const panel = Array.from({ length: 7 }, (_, i) => ({ name: `Panelist ${i}` }));
    expect(validatePeople({ guests: [], panel, chairpersonName: '', isCapstone: true }).panel).toMatch(/up to 6/);
    expect(validatePeople({ guests: [], panel, chairpersonName: '', isCapstone: false }).panel).toBeUndefined();
  });

  it('flags names over 120 characters', () => {
    const long = 'x'.repeat(121);
    expect(validatePeople({ guests: [{ id: 'g', name: long }], panel: [], chairpersonName: '', isCapstone: false }).guests).toBeDefined();
  });
});
