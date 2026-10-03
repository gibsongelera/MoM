import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { fmtManila } from '@/lib/utils/datetime';
import { humanize } from '@/lib/ui/status';
import { PERSONAL_COLUMNS, type PersonalMeetingWithTranscript } from '@/lib/personal/types';
import { buttonClasses } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { EmergencyPill, MeetingStatusPill, MeetingTypePill } from '@/components/ui/StatusPill';
import RecordingPanel from '@/components/personal/RecordingPanel';
import TranscriptViewer from '@/components/personal/TranscriptViewer';
import AddMyRecordingButton from '@/components/personal/AddMyRecordingButton';
import AskAssistantButton from '@/components/assistant/AskAssistantButton';

export const metadata: Metadata = { title: 'Meeting | ZPPSU SmartMin' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MeetingRow = {
  id: string;
  title: string;
  starts_at: string;
  duration_min: number | null;
  venue: string | null;
  status: string;
  meeting_type: string;
  sub_type: string | null;
  project_title: string | null;
  agenda: string[] | null;
  is_emergency: boolean;
  guests: { name: string; affiliation?: string | null }[] | null;
  chairperson_name: string | null;
  adviser_name: string | null;
  panel_members: { name: string; affiliation?: string | null }[] | null;
  chair_id: string | null;
  secretary_id: string | null;
  meeting_participants: { user_id: string }[] | null;
};

/** Read-only meeting page for faculty, plus their own private recording of it. */
export default async function FacultyMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole('faculty');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();

  const { data } = await supabase
    .from('meetings')
    .select(
      'id, title, starts_at, duration_min, venue, status, meeting_type, sub_type, project_title, agenda, is_emergency, guests, ' +
        'chairperson_name, adviser_name, panel_members, chair_id, secretary_id, meeting_participants(user_id)',
    )
    .eq('id', id)
    .maybeSingle();
  const m = data as unknown as MeetingRow | null;
  if (!m) notFound();

  const peopleIds = [m.chair_id, m.secretary_id, ...(m.meeting_participants ?? []).map((p) => p.user_id)].filter((x): x is string => Boolean(x));
  const [profilesRes, transcriptRes, minutesRes, attendanceRes, mineRes] = await Promise.all([
    peopleIds.length ? supabase.from('profiles').select('id, name, position').in('id', peopleIds) : Promise.resolve({ data: [] as { id: string; name: string; position: string | null }[] }),
    supabase.from('transcripts').select('id').eq('meeting_id', id).limit(1).maybeSingle(),
    supabase.from('minutes').select('status').eq('meeting_id', id).maybeSingle(),
    supabase.from('attendance').select('records').eq('meeting_id', id).maybeSingle(),
    supabase
      .from('personal_meetings')
      .select(`${PERSONAL_COLUMNS}, transcript_segments`)
      .eq('meeting_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const nameOf = new Map((profilesRes.data ?? []).map((p) => [p.id, p.name]));
  const participants = (m.meeting_participants ?? []).map((p) => nameOf.get(p.user_id)).filter((n): n is string => Boolean(n));
  const records = ((attendanceRes.data?.records as { userId?: string | null; name: string; present: boolean }[] | null) ?? []).filter(Boolean);
  const me = records.find((r) => r.userId === user.id);
  const mine = mineRes.data as unknown as PersonalMeetingWithTranscript | null;
  const minutesStatus = minutesRes.data?.status as string | undefined;

  const people: { label: string; value: string | null }[] = [
    { label: 'Approving head', value: m.chair_id ? (nameOf.get(m.chair_id) ?? null) : null },
    { label: 'Secretary', value: m.secretary_id ? (nameOf.get(m.secretary_id) ?? null) : null },
    { label: 'Chairperson', value: m.chairperson_name },
    { label: 'Panel', value: (m.panel_members ?? []).map((p) => (p.affiliation ? `${p.name} (${p.affiliation})` : p.name)).join(', ') || null },
    { label: 'Adviser', value: m.adviser_name },
    { label: 'Participants', value: participants.join(', ') || null },
    { label: 'Guests', value: (m.guests ?? []).map((g) => g.name).join(', ') || null },
  ];

  return (
    <>
      <Link href="/faculty/my-meetings" className="mb-md inline-flex items-center gap-xs font-body-sm font-semibold text-primary hover:underline">
        <Icon name="arrow_back" size={18} /> My Meetings
      </Link>

      <header className="mb-lg flex flex-col gap-md lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-xs flex flex-wrap items-center gap-xs">
            <MeetingTypePill type={m.meeting_type} subType={m.sub_type} />
            {m.is_emergency ? <EmergencyPill /> : null}
            <MeetingStatusPill status={m.status} />
          </div>
          <h1 className="font-h1 text-h1">{m.title}</h1>
          {m.project_title ? <p className="font-body-lg text-tertiary">{m.project_title}</p> : null}
        </div>
        <AskAssistantButton />
      </header>

      <div className="grid grid-cols-1 gap-md lg:grid-cols-12">
        <div className="flex flex-col gap-md lg:col-span-5">
          <section aria-labelledby="when-h" className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
            <h2 id="when-h" className="sr-only">
              When and where
            </h2>
            <dl className="flex flex-col gap-sm font-body-md">
              <div className="flex items-center gap-sm">
                <dt>
                  <Icon name="schedule" size={18} className="text-on-surface-variant" />
                  <span className="sr-only">When</span>
                </dt>
                <dd>
                  {fmtManila(m.starts_at)}
                  {m.duration_min ? ` · ${m.duration_min} min` : ''}
                </dd>
              </div>
              <div className="flex items-center gap-sm">
                <dt>
                  <Icon name="place" size={18} className="text-on-surface-variant" />
                  <span className="sr-only">Venue</span>
                </dt>
                <dd>{m.venue || 'Venue to be announced'}</dd>
              </div>
              {me ? (
                <div className="flex items-center gap-sm">
                  <dt>
                    <Icon name="how_to_reg" size={18} className="text-on-surface-variant" />
                    <span className="sr-only">Your attendance</span>
                  </dt>
                  <dd>{me.present ? 'You were marked present' : 'You were marked absent'}</dd>
                </div>
              ) : null}
            </dl>
            {m.agenda?.length ? (
              <div className="mt-md border-t border-outline-variant pt-md">
                <h3 className="font-label-caps text-label-caps uppercase text-on-surface-variant">Agenda</h3>
                <ol className="mt-xs list-decimal pl-lg font-body-md">
                  {m.agenda.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ol>
              </div>
            ) : null}
          </section>

          <section aria-labelledby="people-h" className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
            <h2 id="people-h" className="mb-sm flex items-center gap-sm font-h3 text-h3">
              <Icon name="groups" className="text-primary" /> People
            </h2>
            <dl className="flex flex-col gap-sm">
              {people
                .filter((p) => p.value)
                .map((p) => (
                  <div key={p.label}>
                    <dt className="font-label-caps text-label-caps uppercase text-on-surface-variant">{p.label}</dt>
                    <dd className="font-body-md">{p.value}</dd>
                  </div>
                ))}
            </dl>
          </section>

          <section aria-labelledby="record-h" className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
            <h2 id="record-h" className="mb-sm flex items-center gap-sm font-h3 text-h3">
              <Icon name="description" className="text-primary" /> Official record
            </h2>
            <ul className="flex flex-col gap-sm font-body-sm">
              <li className="flex items-center justify-between gap-sm">
                <span>Attendance</span>
                <span className="text-on-surface-variant">
                  {records.length ? `${records.filter((r) => r.present).length} of ${records.length} present` : 'Not taken yet'}
                </span>
              </li>
              <li className="flex items-center justify-between gap-sm">
                <span>Transcript</span>
                {transcriptRes.data ? (
                  <Link href={`/faculty/transcript-view?m=${m.id}`} className={buttonClasses('ghost', 'sm')}>
                    <Icon name="closed_caption" size={18} /> Read
                  </Link>
                ) : (
                  <span className="text-on-surface-variant">Not available yet</span>
                )}
              </li>
              <li className="flex items-center justify-between gap-sm">
                <span>Minutes</span>
                {minutesStatus ? (
                  <span className="flex flex-wrap justify-end gap-xs">
                    <Link href={`/print/meetings/${m.id}`} target="_blank" className={buttonClasses('ghost', 'sm')}>
                      <Icon name="article" size={18} /> {minutesStatus === 'approved' ? 'View approved minutes' : `View draft (${humanize(minutesStatus)})`}
                    </Link>
                    <a href={`/api/minutes/${m.id}/export?format=pdf`} className={buttonClasses('ghost', 'sm')} aria-label="Download the minutes as PDF">
                      <Icon name="picture_as_pdf" size={18} /> PDF
                    </a>
                    <a href={`/api/minutes/${m.id}/export?format=docx`} className={buttonClasses('ghost', 'sm')} aria-label="Download the minutes as Word">
                      <Icon name="description" size={18} /> Word
                    </a>
                  </span>
                ) : (
                  <span className="text-on-surface-variant">Not written yet</span>
                )}
              </li>
            </ul>
          </section>
        </div>

        <div className="flex flex-col gap-md lg:col-span-7">
          {mine ? (
            <>
              <RecordingPanel
                personalId={mine.id}
                userId={user.id}
                title={m.title}
                audioPath={mine.audio_path}
                audioSize={mine.audio_size_bytes}
                transcriptStatus={mine.transcript_status}
                transcriptError={mine.transcript_error}
              />
              <p className="font-caption text-caption text-on-surface-variant">
                Your recording is private and is kept in your{' '}
                <Link href={`/faculty/personal-meetings/${mine.id}`} className="font-semibold text-primary hover:underline">
                  personal log
                </Link>
                . It doesn&apos;t change the official minutes.
              </p>
              {mine.transcript_status === 'completed' && mine.transcript_segments?.length ? (
                <TranscriptViewer title={`${m.title} (my recording)`} segments={mine.transcript_segments} language={mine.transcript_language} />
              ) : null}
            </>
          ) : (
            <section className="flex flex-col items-start gap-sm rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-lg">
              <h2 className="flex items-center gap-sm font-h3 text-h3">
                <Icon name="graphic_eq" className="text-primary" /> My recording
              </h2>
              <p className="font-body-md text-on-surface-variant">
                Recorded this meeting yourself? Upload it (or record now) to keep a private copy with its own transcript in your personal log.
                The official record stays with the secretary.
              </p>
              <AddMyRecordingButton meeting={{ id: m.id, title: m.title, starts_at: m.starts_at, venue: m.venue, duration_min: m.duration_min }} userId={user.id} />
            </section>
          )}
        </div>
      </div>
    </>
  );
}
