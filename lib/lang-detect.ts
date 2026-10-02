// Lightweight EN/TL detector for "Auto (EN + TL)" transcription mode.
// Web Speech and single-pass STT can't truly auto-detect per word, so we tag
// each finished segment by scanning for common Tagalog/Filipino function words
// and markers. Good enough to label code-switched (Taglish) meetings.

const TAGALOG_MARKERS = new Set([
  'ang', 'ng', 'mga', 'sa', 'na', 'pa', 'po', 'ho', 'ay', 'at', 'o', 'kung',
  'dahil', 'para', 'pero', 'kasi', 'naman', 'lang', 'talaga', 'yung', 'iyong',
  'ito', 'iyan', 'iyon', 'dito', 'diyan', 'doon', 'ganito', 'ganyan', 'ganoon',
  'ako', 'ikaw', 'ka', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'natin', 'namin',
  'ninyo', 'nila', 'ko', 'mo', 'niya', 'akin', 'iyo', 'kanya', 'atin', 'amin',
  'hindi', 'wala', 'meron', 'mayroon', 'oo', 'opo', 'huwag', 'sana', 'baka',
  'kailangan', 'gusto', 'ayaw', 'pwede', 'puwede', 'dapat', 'maaari', 'nga',
  'daw', 'raw', 'muna', 'rin', 'din', 'pala', 'ba', 'kaya', 'upang', 'nang',
  'magandang', 'umaga', 'salamat', 'pulong', 'katitikan', 'kurikulum',
  'pagbabago', 'susunod', 'linggo', 'ipagpatuloy', 'isumite', 'komite',
  'pinansya', 'iminumungkahi', 'sumasang-ayon', 'makikipag-ugnayan',
]);

/** Returns 'tl' when the text carries enough Tagalog markers, else 'en'. */
export function detectLang(text: string): 'en' | 'tl' {
  const words = text
    .toLowerCase()
    .replace(/[^a-záéíóúñ\s-]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'en';
  let tl = 0;
  for (const w of words) if (TAGALOG_MARKERS.has(w)) tl++;
  // Two markers, or >12% of the words, reads as Tagalog/Taglish.
  return tl >= 2 || tl / words.length > 0.12 ? 'tl' : 'en';
}

export const LANG_LABEL: Record<'en' | 'tl', string> = { en: 'EN', tl: 'TL' };

/** Majority language across a set of tagged segments → an app locale. */
export function majorityLocale(segments: { lang?: 'en' | 'tl' }[]): string {
  const tl = segments.filter((s) => s.lang === 'tl').length;
  const en = segments.filter((s) => s.lang === 'en').length;
  return tl > en ? 'tl-PH' : 'en-US';
}

/** Normalise a provider language code (ElevenLabs / ISO) to the app locale. */
export function normalizeLocale(code?: string | null): string {
  if (!code) return 'en-US';
  const c = code.toLowerCase();
  if (c.startsWith('tl') || c.startsWith('fil') || c.startsWith('tgl')) return 'tl-PH';
  if (c.startsWith('en') || c.startsWith('eng')) return 'en-US';
  return code;
}
