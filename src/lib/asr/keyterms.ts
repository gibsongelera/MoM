/**
 * Builds the ElevenLabs keyterm list for a meeting.
 *
 * Keyterms are the single highest-leverage accuracy lever ElevenLabs offers:
 * feeding it participant names, department codes and institutional
 * vocabulary measurably improves recognition of exactly the proper nouns a
 * generic model gets wrong. Limits per ElevenLabs docs (Aug 2026): up to 1000
 * terms, each strictly under 50 characters (49 max - ElevenLabs's own error message
 * confirmed the boundary is exclusive), no more than 5 words, and none of the
 * characters `< > { } [ ] \`. Terms beyond 100 incur a 20-second minimum
 * billable duration and a 20% cost surcharge — acceptable for accuracy on an
 * institutional record, but worth knowing.
 */

const MAX_TERMS = 1000;
const MAX_CHARS = 49; // ElevenLabs rejects with "must be less than 50 characters" - i.e. strictly under 50, not <=50
const MAX_WORDS = 5;
const PROHIBITED_CHARS = /[<>{}[\]\\]/g;

const INSTITUTIONAL_TERMS = [
  'ZPPSU',
  'Zamboanga Peninsula Polytechnic State University',
  'CHED',
  'CHED CMO',
  'CICS',
  'BSIT',
  'BSCS',
  'OBE',
  'Sangguniang',
  'Kapulungan',
  'Sanggunian',
  'Faculty Senate',
  'Board of Regents',
  'Data Privacy Act',
  'RA 10173',
];

export interface KeytermSource {
  meeting: { project_title?: string | null; sub_type?: string | null };
  departmentShort?: string | null;
  departmentName?: string | null;
  participantNames: string[];
}

function clean(term: string | null | undefined): string | null {
  const t = (term ?? '').replace(PROHIBITED_CHARS, '').trim();
  if (!t) return null;
  const words = t.split(/\s+/);
  const trimmedToWords = words.length > MAX_WORDS ? words.slice(0, MAX_WORDS).join(' ') : t;
  return trimmedToWords.length > MAX_CHARS ? trimmedToWords.slice(0, MAX_CHARS).trim() : trimmedToWords;
}

export function buildKeyterms(source: KeytermSource): string[] {
  const candidates: (string | null | undefined)[] = [
    ...source.participantNames,
    source.departmentShort,
    source.departmentName,
    source.meeting.project_title,
    source.meeting.sub_type,
    ...INSTITUTIONAL_TERMS,
  ];

  const seen = new Set<string>();
  const terms: string[] = [];

  for (const candidate of candidates) {
    const cleaned = clean(candidate);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(cleaned);
    if (terms.length >= MAX_TERMS) break;
  }

  return terms;
}
