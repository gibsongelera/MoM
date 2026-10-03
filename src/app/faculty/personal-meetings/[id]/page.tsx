import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { fmtManila, fmtManilaDate, isoDaysAgo } from '@/lib/utils/datetime';
import { MODE_LABEL, PERSONAL_COLUMNS, STATUS_LABEL, fmtPersonalWhen, type PersonalMeetingWithTranscript } from '@/lib/personal/types';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/ui/cn';
import RecordingPanel from '@/components/personal/RecordingPanel';
import TranscriptViewer from '@/components/personal/TranscriptViewer';
import PersonalMeetingActions from '@/components/personal/PersonalMeetingActions';
import type { LinkableMeeting } from '@/components/personal/PersonalMeetingForm';

export const metadata: Metadata = { title: 'Personal meeting | ZPPSU SmartMin' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_PILL = { scheduled: 'pill-progress', done: 'pill-done', cancelled: 'pill-pending' } as const;

export default async function PersonalMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole('faculty');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();

  const since = isoDaysAgo(180);
  const [rowRes, meetingsRes] = await Promise.all([
    supabase.from('personal_meetings').select(`${PERSONAL_COLUMNS}, transcript_segments`).eq('id', id).eq('user_id', user.id).maybeSingle(),
    supabase.from('meetings').select('id, title, starts_at').gte('starts_at', since).order('starts_at', { ascending: false }).limit(80),
  ]);
  const row = rowRes.data as unknown as PersonalMeetingWithTranscript | null;
  if (!row) notFound();

  const linked = row.meeting_id
    ? (await supabase.from('meetings').select('id, title, starts_at, venue').eq('id', row.meeting_id).maybeSingle()).data
    : null;

  const details: { icon: string; label: string; value: string | null }[] = [
    { icon: 'schedule', label: 'When', value: `${fmtPersonalWhen(row.meeting_date, row.meeting_time)}${row.duration_min ? ` · ${row.duration_min} min` : ''}` },
    { icon: row.mode === 'online' ? 'videocam' : row.mode === 'phone' ? 'call' : 'place', label: 'Where', value: [row.mode ? MODE_LABEL[row.mode] : null, row.location].filter(Boolean).join(' · ') || null },
    { icon: 'group', label: 'With', value: row.attendees },
    { icon: 'flag', label: 'Follow up on', value: row.follow_up_date ? fmtPersonalWhen(row.follow_up_date, null) : null },
  ];
  const texts: { label: string; value: string | null }[] = [
    { label: 'Purpose / agenda', value: row.purpose },
    { label: 'Notes', value: row.notes },
    { label: 'Outcome / agreements', value: row.outcome },
  ];

  return (
    <>
      <Link href="/faculty/personal-meetings" className="mb-md inline-flex items-center gap-xs font-body-sm font-semibold text-primary hover:underline">
        <Icon name="arrow_back" size={18} /> Personal Meetings
      </Link>

      <header className="mb-lg flex flex-col gap-md lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-xs flex flex-wrap items-center gap-xs">
            <span className="pill pill-regular">{row.type ?? 'Personal'}</span>
            <span className={cn('pill', STATUS_PILL[row.status])}>{STATUS_LABEL[row.status]}</span>
            {row.archived_at ? <span className="pill pill-pending">Archived {fmtManilaDate(row.archived_at)}</span> : null}
          </div>
          <h1 className="font-h1 text-h1">{row.title}</h1>
          <p className="font-body-sm text-on-surface-variant">Private to you · last updated {fmtManila(row.updated_at)}</p>
        </div>
        <PersonalMeetingActions row={row} userId={user.id} linkable={(meetingsRes.data as LinkableMeeting[] | null) ?? []} />
      </header>

      <div className="grid grid-cols-1 gap-md lg:grid-cols-12">
        <section aria-label="Details" className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg lg:col-span-5">
          <dl className="flex flex-col gap-sm font-body-md">
            {details
              .filter((d) => d.value)
              .map((d) => (
                <div key={d.label} className="flex items-start gap-sm">
                  <dt className="flex items-center gap-xs text-on-surface-variant">
                    <Icon name={d.icon} size={18} />
                    <span className="sr-only">{d.label}</span>
                  </dt>
                  <dd>{d.value}</dd>
                </div>
              ))}
          </dl>
          {linked ? (
            <Link
              href={`/faculty/my-meetings/${linked.id}`}
              className="mt-md flex items-center gap-sm rounded-lg border border-outline-variant bg-surface p-sm transition-colors duration-150 hover:border-primary"
            >
              <Icon name="link" className="text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block font-caption text-caption text-on-surface-variant">About the meeting</span>
                <span className="block truncate font-body-sm font-semibold">{linked.title}</span>
                <span className="block font-caption text-caption text-on-surface-variant">{fmtManila(linked.starts_at)}</span>
              </span>
              <Icon name="chevron_right" className="text-on-surface-variant" />
            </Link>
          ) : null}
          {texts.some((t) => t.value) ? (
            <div className="mt-md flex flex-col gap-md border-t border-outline-variant pt-md">
              {texts
                .filter((t) => t.value)
                .map((t) => (
                  <div key={t.label}>
                    <h2 className="font-label-caps text-label-caps uppercase text-on-surface-variant">{t.label}</h2>
                    <p className="mt-xs whitespace-pre-wrap font-body-md">{t.value}</p>
                  </div>
                ))}
            </div>
          ) : (
            <p className="mt-md border-t border-outline-variant pt-md font-body-sm text-on-surface-variant">
              No notes yet. Use <strong>Edit</strong> to add the purpose, notes and what was agreed.
            </p>
          )}
        </section>

        <div id="recording" className="flex scroll-mt-lg flex-col gap-md lg:col-span-7">
          <RecordingPanel
            personalId={row.id}
            userId={user.id}
            title={row.title}
            audioPath={row.audio_path}
            audioSize={row.audio_size_bytes}
            transcriptStatus={row.transcript_status}
            transcriptError={row.transcript_error}
          />
          {row.transcript_status === 'completed' && row.transcript_segments?.length ? (
            <TranscriptViewer title={row.title} segments={row.transcript_segments} language={row.transcript_language} />
          ) : null}
        </div>
      </div>
    </>
  );
}
