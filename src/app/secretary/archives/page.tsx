import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { startOfManilaDay, fmtManila } from '@/lib/utils/datetime';
import { MEETING_STATUS, MEETING_TYPE } from '@/lib/ui/status';
import { buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { inputClass } from '@/components/ui/Field';
import { EmergencyPill, MeetingStatusPill, MeetingTypePill } from '@/components/ui/StatusPill';

export const metadata: Metadata = { title: 'Meeting History | ZPPSU SmartMin' };

interface HistoryRow {
  id: string;
  title: string;
  starts_at: string;
  meeting_type: string;
  sub_type: string | null;
  project_title: string | null;
  status: string;
  is_emergency: boolean;
  venue: string | null;
  meeting_attachments: { count: number }[] | null;
}

/**
 * "Meeting History" (renamed from Archives at the client's request): meetings
 * that have already happened, with their transcript, minutes and attachments,
 * and a Print action so saved minutes can be printed later.
 * Filters are a plain GET form, so they work without JavaScript.
 */
export default async function MeetingHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string; emergency?: string }>;
}) {
  const { q = '', type = '', status = '', emergency = '' } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('meetings')
    .select('id, title, starts_at, meeting_type, sub_type, project_title, status, is_emergency, venue, meeting_attachments(count)')
    .lt('starts_at', startOfManilaDay().toISOString())
    .order('starts_at', { ascending: false })
    .limit(100);
  if (type in MEETING_TYPE) query = query.eq('meeting_type', type);
  if (status in MEETING_STATUS) query = query.eq('status', status);
  if (emergency === '1') query = query.eq('is_emergency', true);
  const term = q.trim().slice(0, 80);
  if (term) query = query.ilike('title', `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);

  const { data, error } = await query;
  if (error) throw new Error(`Could not load meeting history: ${error.message}`);
  const meetings = (data as unknown as HistoryRow[]) ?? [];
  const filtered = Boolean(term || type || status || emergency);

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Meeting History</h1>
        <p className="font-body-lg text-on-surface-variant">
          Past meetings with their transcripts, minutes and attachments. Print any meeting&apos;s minutes from here.
        </p>
      </header>

      <form method="get" role="search" aria-label="Filter meeting history" className="mb-lg grid grid-cols-1 gap-sm rounded-xl border border-outline-variant bg-surface-container-low p-md md:grid-cols-[2fr_1fr_1fr_auto_auto] md:items-end">
        <div>
          <label htmlFor="history-q" className="font-label-caps text-label-caps uppercase text-on-surface-variant">
            Search titles
          </label>
          <input id="history-q" name="q" type="search" defaultValue={term} className={`${inputClass} mt-xs`} placeholder="e.g. Senate, Mock Defense" />
        </div>
        <div>
          <label htmlFor="history-type" className="font-label-caps text-label-caps uppercase text-on-surface-variant">
            Type
          </label>
          <select id="history-type" name="type" defaultValue={type} className={`${inputClass} mt-xs`}>
            <option value="">All types</option>
            {Object.entries(MEETING_TYPE).map(([value, spec]) => (
              <option key={value} value={value}>
                {spec.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="history-status" className="font-label-caps text-label-caps uppercase text-on-surface-variant">
            Status
          </label>
          <select id="history-status" name="status" defaultValue={status} className={`${inputClass} mt-xs`}>
            <option value="">All statuses</option>
            {Object.entries(MEETING_STATUS).map(([value, spec]) => (
              <option key={value} value={value}>
                {spec.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex min-h-10 items-center gap-xs font-body-sm">
          <input type="checkbox" name="emergency" value="1" defaultChecked={emergency === '1'} className="h-4 w-4 rounded border-outline text-primary" />
          Emergency only
        </label>
        <div className="flex gap-xs">
          <button type="submit" className={buttonClasses('primary')}>
            <Icon name="filter_list" size={18} /> Filter
          </button>
          {filtered ? (
            <Link href="/secretary/archives" className={buttonClasses('ghost')}>
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      {meetings.length === 0 ? (
        <EmptyState icon="history" title={filtered ? 'No meetings match these filters' : 'No past meetings yet'}>
          {filtered
            ? 'Try a different search or clear the filters.'
            : 'Meetings appear here once their date has passed, with their minutes and attachments.'}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-md md:grid-cols-2 xl:grid-cols-3">
          {meetings.map((m) => {
            const files = m.meeting_attachments?.[0]?.count ?? 0;
            return (
              <li key={m.id} className="folder-card flex flex-col">
                <div className="mb-sm flex flex-wrap items-center gap-xs">
                  <MeetingTypePill type={m.meeting_type} subType={m.sub_type} />
                  {m.is_emergency ? <EmergencyPill /> : null}
                  <MeetingStatusPill status={m.status} className="ml-auto" />
                </div>
                <h2 className="font-body-lg font-semibold leading-snug">
                  <Link href={`/secretary/meetings/${m.id}`} className="hover:underline">
                    {m.title}
                  </Link>
                </h2>
                {m.project_title ? <p className="font-body-sm text-tertiary">{m.project_title}</p> : null}
                <p className="mt-xs font-caption text-caption text-on-surface-variant">
                  {fmtManila(m.starts_at)}
                  {m.venue ? ` · ${m.venue}` : ''}
                  {files ? ` · ${files} attachment${files === 1 ? '' : 's'}` : ''}
                </p>
                <div className="mt-md flex flex-wrap gap-xs border-t border-outline-variant pt-sm">
                  <Link href={`/secretary/meetings/${m.id}`} className={buttonClasses('secondary', 'sm')}>
                    Open
                  </Link>
                  <Link href={`/secretary/mom-editor?m=${m.id}`} className={buttonClasses('ghost', 'sm')}>
                    <Icon name="description" size={16} /> Minutes
                  </Link>
                  <a href={`/print/meetings/${m.id}`} target="_blank" rel="noreferrer" className={buttonClasses('ghost', 'sm')}>
                    <Icon name="print" size={16} /> Print
                  </a>
                  <a href={`/api/minutes/${m.id}/export?format=pdf`} className={buttonClasses('ghost', 'sm')} aria-label={`Download ${m.title} minutes as PDF`}>
                    <Icon name="picture_as_pdf" size={16} /> PDF
                  </a>
                  <a href={`/api/minutes/${m.id}/export?format=docx`} className={buttonClasses('ghost', 'sm')} aria-label={`Download ${m.title} minutes as Word`}>
                    <Icon name="description" size={16} /> Word
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
