import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { MEETING_COLUMNS, departmentHead } from '@/lib/meetings/queries';
import { buildRoster, type AttendanceRecord, type RosterPerson } from '@/lib/meetings/roster';
import type { AttachmentKind } from '@/lib/meetings/files';
import type { MeetingGuest, PanelMember, TranscriptionStatus as JobStatus } from '@/lib/types/domain';
import { fmtManila } from '@/lib/utils/datetime';
import { buttonClasses } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { EmergencyPill, MeetingStatusPill, MeetingTypePill } from '@/components/ui/StatusPill';
import { MINUTES_STATUS } from '@/lib/ui/status';
import AttendancePanel from '@/components/meetings/AttendancePanel';
import AttachmentsPanel, { type AttachmentItem } from '@/components/meetings/AttachmentsPanel';
import TranscriptionStatus from '@/components/meetings/TranscriptionStatus';
import UploadAudioForm from '@/components/dashboard/UploadAudioForm';
import { cn } from '@/lib/ui/cn';

export const metadata: Metadata = { title: 'Meeting | ZPPSU SmartMin' };

const STEPS = [
  { key: 'record', label: 'Record or upload', icon: 'mic' },
  { key: 'attendance', label: 'Attendance', icon: 'how_to_reg' },
  { key: 'attachments', label: 'Attachments', icon: 'attach_file' },
  { key: 'minutes', label: 'Minutes', icon: 'description' },
  { key: 'print', label: 'Print', icon: 'print' },
] as const;
type StepKey = (typeof STEPS)[number]['key'];

interface MeetingRow {
  id: string;
  title: string;
  starts_at: string;
  duration_min: number;
  venue: string | null;
  status: string;
  meeting_type: string;
  sub_type: string | null;
  project_title: string | null;
  is_emergency: boolean;
  guests: MeetingGuest[];
  chairperson_name: string | null;
  chairperson_id: string | null;
  panel_members: PanelMember[];
  adviser_name: string | null;
  adviser_id: string | null;
  department_id: string;
  chair_id: string | null;
  meeting_participants: { user_id: string }[] | null;
}

export default async function MeetingHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  await requireRole('secretary');
  const { id } = await params;
  const { step: stepParam } = await searchParams;
  const supabase = await createClient();

  const { data: meetingData } = await supabase.from('meetings').select(MEETING_COLUMNS).eq('id', id).maybeSingle();
  if (!meetingData) notFound();
  const meeting = meetingData as unknown as MeetingRow;

  const participantIds = (meeting.meeting_participants ?? []).map((p) => p.user_id);
  const linkedIds = [...new Set([...participantIds, meeting.chair_id, meeting.chairperson_id, meeting.adviser_id].filter(Boolean) as string[])];

  const [peopleRes, attendanceRes, attachmentsRes, jobRes, minutesRes, transcriptRes, head, canEditRes] = await Promise.all([
    linkedIds.length
      ? supabase.from('profiles').select('id, name, role, position').in('id', linkedIds)
      : Promise.resolve({ data: [] as RosterPerson[] }),
    supabase.from('attendance').select('started_at, records').eq('meeting_id', id).maybeSingle(),
    supabase
      .from('meeting_attachments')
      .select('id, kind, file_name, mime_type, size_bytes, caption, storage_path, created_at')
      .eq('meeting_id', id)
      .order('created_at'),
    supabase
      .from('transcription_jobs')
      .select('id, status')
      .eq('meeting_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('minutes').select('id, status, locked_at').eq('meeting_id', id).maybeSingle(),
    supabase.from('transcripts').select('id').eq('meeting_id', id).limit(1),
    departmentHead(supabase, meeting.department_id),
    supabase.rpc('sm_can_edit_meeting_docs', { p_meeting_id: id }),
  ]);

  const canEdit = canEditRes.data === true;
  const people = (peopleRes.data as RosterPerson[] | null) ?? [];
  const participantPeople = people.filter((p) => participantIds.includes(p.id) && p.id !== meeting.chair_id);
  const existing = ((attendanceRes.data?.records as AttendanceRecord[] | null) ?? []).map((r) => ({
    ...r,
    // Records written by the older app have no key/kind.
    key: r.key ?? (r.userId ? `u:${r.userId}` : `g:${r.name}`),
    kind: r.kind ?? 'participant',
  }));
  const roster = buildRoster({
    approverId: meeting.chair_id ?? head?.id ?? null,
    chairpersonName: meeting.chairperson_name,
    chairpersonId: meeting.chairperson_id,
    panel: meeting.meeting_type === 'capstone' ? meeting.panel_members : [],
    adviserName: meeting.adviser_name,
    adviserId: meeting.adviser_id,
    participants: [...people.filter((p) => p.id === meeting.chair_id), ...participantPeople],
    guests: meeting.guests,
    existing,
  });

  const rawAttachments = (attachmentsRes.data as Omit<AttachmentItem, 'url'>[] | null) ?? [];
  const signed = rawAttachments.length
    ? (await supabase.storage.from('meeting-attachments').createSignedUrls(rawAttachments.map((a) => a.storage_path), 3600)).data ?? []
    : [];
  const attachments: AttachmentItem[] = rawAttachments.map((a, i) => ({ ...a, kind: a.kind as AttachmentKind, url: signed[i]?.signedUrl ?? null }));

  const job = jobRes.data as { id: string; status: JobStatus } | null;
  const hasTranscript = (transcriptRes.data?.length ?? 0) > 0;
  const minutes = minutesRes.data as { id: string; status: keyof typeof MINUTES_STATUS; locked_at: string | null } | null;

  const step: StepKey = (STEPS.some((s) => s.key === stepParam) ? stepParam : job || hasTranscript ? 'attendance' : 'record') as StepKey;
  const panelCount = meeting.panel_members?.length ?? 0;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-sm font-body-sm">
        <Link href="/secretary/meetings" className="inline-flex items-center gap-xs text-primary hover:underline">
          <Icon name="arrow_back" size={16} /> Meetings
        </Link>
      </nav>

      <header className="mb-lg flex flex-col gap-sm">
        <div className="flex flex-wrap items-center gap-xs">
          <MeetingTypePill type={meeting.meeting_type} subType={meeting.sub_type} />
          {meeting.is_emergency ? <EmergencyPill /> : null}
          <MeetingStatusPill status={meeting.status} />
          <TranscriptionStatus jobId={job?.id ?? null} initialStatus={job?.status ?? null} />
        </div>
        <h1 className="font-h1 text-h1">{meeting.title}</h1>
        {meeting.project_title ? <p className="font-body-md text-tertiary">{meeting.project_title}</p> : null}
        <p className="flex flex-wrap items-center gap-x-md gap-y-xs font-body-sm text-on-surface-variant">
          <span className="inline-flex items-center gap-xs">
            <Icon name="schedule" size={16} /> {fmtManila(meeting.starts_at)}
          </span>
          {meeting.venue ? (
            <span className="inline-flex items-center gap-xs">
              <Icon name="place" size={16} /> {meeting.venue}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-xs">
            <Icon name="groups" size={16} /> {roster.length} on the attendance list
          </span>
          {meeting.meeting_type === 'capstone' ? (
            <span className="inline-flex items-center gap-xs">
              <Icon name="school" size={16} /> Chair: {meeting.chairperson_name ?? 'not set'} · {panelCount} panel
            </span>
          ) : null}
        </p>
      </header>

      <nav aria-label="Meeting steps" className="mb-lg overflow-x-auto">
        <ol className="flex min-w-max gap-xs rounded-xl border border-outline-variant bg-surface-container-low p-xs">
          {STEPS.map((s, i) => {
            const active = s.key === step;
            return (
              <li key={s.key}>
                <Link
                  href={`/secretary/meetings/${id}?step=${s.key}`}
                  aria-current={active ? 'step' : undefined}
                  scroll={false}
                  className={cn(
                    'flex min-h-10 items-center gap-xs rounded-lg px-md py-xs font-body-sm transition-colors duration-150',
                    active ? 'bg-primary font-semibold text-on-primary shadow-primary-md' : 'text-on-surface-variant hover:bg-surface-container-highest',
                  )}
                >
                  <span className="font-caption text-caption opacity-80">{i + 1}</span>
                  <Icon name={s.icon} size={18} />
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      {step === 'record' ? (
        <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
          <section className="flex flex-col gap-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
            <h2 className="flex items-center gap-xs font-h3 text-h3">
              <Icon name="mic" size={24} className="text-primary" /> Record now
            </h2>
            <p className="font-body-sm text-on-surface-variant">
              Record from this device&apos;s microphone. When you stop, you&apos;ll come back here to take attendance while it transcribes.
            </p>
            <Link href={`/secretary/live-recording?m=${id}`} className={buttonClasses('primary', 'md', 'self-start')}>
              <Icon name="fiber_manual_record" size={18} /> Start recording
            </Link>
          </section>
          <section className="flex flex-col gap-sm">
            <h2 className="flex items-center gap-xs font-h3 text-h3">
              <Icon name="upload_file" size={24} className="text-primary" /> Or upload a recording
            </h2>
            <p className="font-body-sm text-on-surface-variant">
              Optional — for meetings recorded on another device or while offline.
            </p>
            <UploadAudioForm fixedMeetingId={id} />
          </section>
        </div>
      ) : null}

      {step === 'attendance' ? (
        <AttendancePanel
          meetingId={id}
          initialRecords={roster}
          startedAt={(attendanceRes.data?.started_at as number | null) ?? null}
          canEdit={canEdit}
        />
      ) : null}

      {step === 'attachments' ? <AttachmentsPanel meetingId={id} items={attachments} canEdit={canEdit} /> : null}

      {step === 'minutes' ? (
        <section className="flex flex-col gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
          <h2 className="font-h3 text-h3">Minutes</h2>
          {minutes ? (
            <p className="flex items-center gap-sm font-body-sm">
              Status: <span className={cn('pill', MINUTES_STATUS[minutes.status]?.pill)}>{MINUTES_STATUS[minutes.status]?.label}</span>
            </p>
          ) : (
            <p className="font-body-sm text-on-surface-variant">
              {hasTranscript
                ? 'The transcript is ready. Open the editor to review the drafted minutes.'
                : job
                  ? 'Minutes are drafted automatically once the transcript is ready. You can also start writing now.'
                  : 'Record or upload the meeting first, or start writing the minutes by hand.'}
            </p>
          )}
          <div className="flex flex-wrap gap-sm">
            <Link href={`/secretary/mom-editor?m=${id}`} className={buttonClasses('primary')}>
              <Icon name="edit_document" size={18} /> Open minutes editor
            </Link>
            {hasTranscript ? (
              <Link href={`/secretary/transcript?m=${id}`} className={buttonClasses('secondary')}>
                <Icon name="closed_caption" size={18} /> Review transcript
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === 'print' ? (
        <section className="flex flex-col gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
          <h2 className="font-h3 text-h3">Print or save as PDF</h2>
          <p className="font-body-sm text-on-surface-variant">
            The printed minutes include the attendance list, the defense panel, signatures and a list of attachments.
            {minutes?.status !== 'approved' ? ' Until the head approves them, they print with a DRAFT mark.' : ''}
          </p>
          <div className="flex flex-wrap gap-sm">
            <a href={`/print/meetings/${id}`} target="_blank" rel="noreferrer" className={buttonClasses('secondary')}>
              <Icon name="visibility" size={18} /> Preview
            </a>
            <a href={`/print/meetings/${id}?autoprint=1`} target="_blank" rel="noreferrer" className={buttonClasses('primary')}>
              <Icon name="print" size={18} /> Print now
            </a>
          </div>
        </section>
      ) : null}
    </>
  );
}
