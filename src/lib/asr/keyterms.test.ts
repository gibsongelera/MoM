import { describe, expect, it } from 'vitest';
import { buildKeyterms } from './keyterms';

// ElevenLabs rejects the whole submission with invalid_keyword_length if ANY
// term is 50+ characters ("less than 50" is exclusive), 6+ words, or contains
// < > { } [ ] \. These tests pin the guarantees the provider relies on.
describe('buildKeyterms', () => {
  const base = { meeting: {}, participantNames: [] as string[] };

  it('keeps every term strictly under 50 characters', () => {
    const terms = buildKeyterms({
      ...base,
      meeting: {
        project_title:
          'A Comprehensive Study on the Institutionalization of Data-Driven Governance Practices in State Universities',
      },
      participantNames: ['Dr. Maria Concepcion Villanueva-Delos Reyes Santos Jr.'],
    });

    expect(terms.length).toBeGreaterThan(0);
    for (const t of terms) {
      expect(t.length).toBeLessThan(50);
    }
  });

  it('caps terms at five words', () => {
    const terms = buildKeyterms({
      ...base,
      meeting: { project_title: 'one two three four five six seven' },
    });
    expect(terms[0]).toBe('one two three four five');
  });

  it('strips characters ElevenLabs prohibits', () => {
    const terms = buildKeyterms({
      ...base,
      meeting: { project_title: '[DRAFT] Capstone <v2> {final}\\' },
    });
    for (const t of terms) {
      expect(t).not.toMatch(/[<>{}[\]\\]/);
    }
  });

  it('drops empty and duplicate terms', () => {
    const terms = buildKeyterms({
      ...base,
      participantNames: ['ZPPSU', '  ', 'zppsu'],
    });
    expect(terms.filter((t) => t.toLowerCase() === 'zppsu')).toHaveLength(1);
  });
});
