/**
 * Document titles and export filenames.
 *
 * Port of docTitleFor / fileNameFor / slugify from assets/js/summarizer.js.
 * The capstone naming scheme is defence-visible: the pre-print modal shows the
 * filename before export, and Archives groups documents by the same fields, so
 * these two functions have to agree exactly with what the UI previews.
 */
import type { Meeting } from '@/lib/types/domain';
import { manilaDateKey } from '@/lib/utils/datetime';

type TitleSource = Pick<Meeting, 'title' | 'meeting_type' | 'sub_type' | 'project_title'> & {
  starts_at?: string;
};

export function slugify(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

/** Heading shown on the document itself. */
export function docTitleFor(meeting: TitleSource | null | undefined): string {
  if (!meeting) return 'Minutes of the Meeting';

  if (meeting.meeting_type === 'capstone') {
    const sub = meeting.sub_type || 'Defense';
    const project = (meeting.project_title ?? '').trim();
    return project ? `Capstone ${sub} — ${project}` : `Capstone ${sub}`;
  }

  if (meeting.meeting_type === 'research') {
    const sub = meeting.sub_type || 'Meeting';
    const project = (meeting.project_title ?? '').trim();
    return project ? `Research ${sub} — ${project}` : `Research ${sub}`;
  }

  return meeting.title ? `Minutes of the ${meeting.title}` : 'Minutes of the Meeting';
}

/** Export filename, without extension: ProjectTitle_SubType_YYYY-MM-DD. */
export function fileNameFor(meeting: TitleSource | null | undefined): string {
  if (!meeting) return 'Meeting_Minutes';

  // Manila calendar day: a 7:30 AM meeting is still 'yesterday' in UTC.
  const datePart = meeting.starts_at ? manilaDateKey(meeting.starts_at) : '';

  if (meeting.meeting_type === 'capstone' || meeting.meeting_type === 'research') {
    const fallback = meeting.meeting_type === 'capstone' ? 'Capstone' : 'Research';
    const project = slugify(meeting.project_title || meeting.title || fallback);
    const sub = slugify(meeting.sub_type || (meeting.meeting_type === 'capstone' ? 'Defense' : 'Meeting'));
    return `${project}_${sub}_${datePart}`;
  }

  return `${slugify(meeting.title || 'Meeting')}_Minutes_${datePart}`;
}
