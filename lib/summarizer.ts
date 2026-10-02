// Extractive summarizer + action-item extractor — faithful TS port of
// assets/js/summarizer.js. Serves as the deterministic offline fallback for the
// real (Claude-backed) analysis route in Phase 2, and provides docTitleFor /
// fileNameFor used across minutes pages.

import type { AgendaItem, Meeting, Transcript, TranscriptSegment } from './types';

const STOPWORDS = new Set(
  'a,an,the,and,or,but,if,then,else,when,while,for,to,of,in,on,at,by,with,as,is,are,was,were,be,been,being,have,has,had,do,does,did,will,would,can,could,should,may,might,must,shall,this,that,these,those,it,its,he,she,they,them,his,her,their,i,me,my,we,us,our,you,your,from,about,into,over,under,again,more,most,less,not,no,yes,so,also,just'.split(','),
);

const ACTION_KEYWORDS = [
  'will', 'shall', 'must', 'should', 'to draft', 'to compile', 'to submit',
  'deadline', 'by next', 'by july', 'by august', 'by september', 'before',
  'i will', 'we will', "i'll", "we'll", 'please', 'kindly',
  'action item', 'action-item', 'to-do', 'todo', 'follow up', 'follow-up',
  'coordinate', 'review', 'finalize', 'prepare', 'send', 'distribute', 'endorse',
];

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !STOPWORDS.has(w) && w.length > 2);
}

export function summarize(text: string, maxSentences = 4): string {
  if (!text) return '';
  const sentences = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || [text];
  if (sentences.length <= maxSentences) return sentences.join(' ').trim();

  const wordFreq: Record<string, number> = {};
  sentences.forEach((s) => tokenize(s).forEach((w) => (wordFreq[w] = (wordFreq[w] || 0) + 1)));

  const scored = sentences.map((s, i) => {
    const words = tokenize(s);
    const freqScore = words.reduce((sum, w) => sum + (wordFreq[w] || 0), 0) / (words.length || 1);
    const positionBoost = 1 - (i / sentences.length) * 0.25;
    const lower = s.toLowerCase();
    const actionBoost = ACTION_KEYWORDS.some((k) => lower.includes(k)) ? 1.25 : 1;
    return { s: s.trim(), score: freqScore * positionBoost * actionBoost, i };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s)
    .join(' ');
}

export function summarizeSegments(segments: TranscriptSegment[], maxSentences = 4): string {
  const full = segments.map((s) => `${s.speaker || ''}: ${s.text}`).join(' ');
  return summarize(full.replace(/^[^:]+:\s*/g, ''), maxSentences);
}

function extractDeadline(s: string): string {
  const months = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  let m = s.match(new RegExp(`\\b${months}\\s+\\d{1,2}(?:,\\s*\\d{4})?\\b`, 'i'));
  if (m) return m[0];
  m = s.match(/by\s+(next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday))/i);
  if (m) return m[1];
  m = s.match(/by\s+(this\s+(?:week|friday|thursday|monday))/i);
  if (m) return m[1];
  return '';
}

function extractAssignee(s: string, seg: TranscriptSegment): string {
  const honorific = /(?:Prof\.|Dr\.|Engr\.|Atty\.|Mr\.|Mrs\.|Ms\.)\s+[A-Z][a-zA-Z.\-]+(?:\s+[A-Z][a-zA-Z.\-]+)?/;
  const m = s.match(honorific);
  if (m) return m[0];
  const direct = s.match(/\b([A-Z][a-z]+),\s*(please|can you|kindly|will you)/);
  if (direct) return direct[1];
  return seg.speaker || '';
}

export function extractActionItems(segments: TranscriptSegment[]): { text: string; assignee: string; deadline: string; confidence: number; sourceSegmentIdx: number }[] {
  const items: { text: string; assignee: string; deadline: string; confidence: number; sourceSegmentIdx: number }[] = [];
  segments.forEach((seg, idx) => {
    const sentences = (seg.text || '').split(/(?<=[.!?])\s+/);
    sentences.forEach((s) => {
      const lower = s.toLowerCase();
      if (!ACTION_KEYWORDS.some((k) => lower.includes(k))) return;
      items.push({
        text: s.trim(),
        assignee: extractAssignee(s, seg),
        deadline: extractDeadline(s),
        confidence: 0.85 + Math.random() * 0.12,
        sourceSegmentIdx: idx,
      });
    });
  });
  const seen = new Set<string>();
  return items.filter((it) => {
    const key = it.text.toLowerCase().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface DraftMinutes {
  meetingId: string;
  status: string;
  callToOrder: string;
  previousMinutes: string;
  agendaItems: AgendaItem[];
  actionItems: { text: string; assignee: string; deadline: string }[];
  adjournment: string;
  aiSummary: string;
}

export function draftMinutesFromTranscript(transcript: Transcript, meeting: Meeting): DraftMinutes {
  const segments = transcript.segments || [];
  const opening = segments.slice(0, 2).map((s) => s.text).join(' ');
  const closing = segments.slice(-2).map((s) => s.text).join(' ');
  const summary = summarizeSegments(segments, 5);
  const actions = extractActionItems(segments);
  const agendaItems: AgendaItem[] = (meeting.agenda || []).map((title) => {
    const related = segments.filter((s) => s.text.toLowerCase().includes(title.toLowerCase().split(' ')[0]));
    return {
      title,
      notes: related.length ? summarizeSegments(related, 2) : 'Discussed during the session. Refer to transcript for verbatim record.',
    };
  });
  return {
    meetingId: meeting.id,
    status: 'draft',
    callToOrder: opening || 'Meeting was called to order.',
    previousMinutes: 'Reviewed and noted.',
    agendaItems: agendaItems.length ? agendaItems : [{ title: 'General Discussion', notes: summary }],
    actionItems: actions,
    adjournment: closing || 'There being no further business, the meeting was adjourned.',
    aiSummary: summary,
  };
}

export function slugify(s: string): string {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

export function docTitleFor(meeting: Meeting | null | undefined): string {
  if (!meeting) return 'Minutes of the Meeting';
  if (meeting.meetingType === 'capstone') {
    const sub = meeting.subType || 'Defense';
    const proj = (meeting.projectTitle || '').trim();
    return proj ? `Capstone ${sub} — ${proj}` : `Capstone ${sub}`;
  }
  if (meeting.meetingType === 'research') {
    const sub = meeting.subType || 'Meeting';
    const proj = (meeting.projectTitle || '').trim();
    return proj ? `Research ${sub} — ${proj}` : `Research ${sub}`;
  }
  return meeting.title ? `Minutes of the ${meeting.title}` : 'Minutes of the Meeting';
}

export function fileNameFor(meeting: Meeting | null | undefined): string {
  if (!meeting) return 'Meeting_Minutes';
  const datePart = (meeting.date || '').slice(0, 10);
  if (meeting.meetingType === 'capstone' || meeting.meetingType === 'research') {
    const prefix = meeting.meetingType === 'capstone' ? 'Capstone' : 'Research';
    const proj = slugify(meeting.projectTitle || meeting.title || prefix);
    const sub = slugify(meeting.subType || 'Meeting');
    return `${proj}_${sub}_${datePart}`;
  }
  return `${slugify(meeting.title || 'Meeting')}_Minutes_${datePart}`;
}
