import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { docTitleFor } from '@/lib/ai/doc-title';
import type { MeetingGuest, MeetingType, PanelMember } from '@/lib/types/domain';
import { buildRoster, type AttendanceRecord, type RosterPerson } from './roster';
import type { AttachmentKind } from './files';

export interface PrintSignature {
  userId: string;
  name: string;
  role: string;
  kind?: 'approver' | 'secretary';
  signedAt: number;
  dataUrl: string;
}

export interface PaperNote {
  id?: string;
  attachmentId?: string | null;
  pageOrPanel?: string | null;
  note: string;
  readAt?: number;
}

export interface PrintableMeeting {
  institution: string;
  department: string | null;
  docTitle: string;
  meeting: {
    id: string;
    title: string;
    starts_at: string;
    venue: string | null;
    meeting_type: MeetingType;
    sub_type: string | null;
    project_title: string | null;
    is_emergency: boolean;
    chairperson_name: string | null;
    adviser_name: string | null;
    panel: PanelMember[];
  };
  presidingName: string | null;
  secretaryName: string | null;
  minutes: {
    status: string;
    call_to_order: string;
    previous_minutes: string;
    agenda_items: { title: string; notes: string }[];
    adjournment: string;
    signatures: PrintSignature[];
    paper_notes: PaperNote[];
    locked_at: string | null;
  } | null;
  tasks: { title: string; assignee: string | null; deadline: string | null; status: string }[];
  attendance: AttendanceRecord[];
  attachments: { kind: AttachmentKind; file_name: string; caption: string | null; created_at: string }[];
}

/**
 * Everything the printed minutes need, read through the caller's RLS-scoped
 * client (so a head or secretary only prints what they may see).
 * Returns null when the meeting does not exist or is not visible.
 */
export async function loadPrintableMeeting(supabase: SupabaseClient, meetingId: string): Promise<PrintableMeeting | null> {
  const { data: m } = await supabase
    .from('meetings')
    .select(
      'id, title, starts_at, venue, meeting_type, sub_type, project_title, is_emergency, department_id, chair_id, secretary_id, ' +
        'chairperson_name, chairperson_id, adviser_name, adviser_id, panel_members, guests, meeting_participants(user_id)',
    )
    .eq('id', meetingId)
    .maybeSingle();
  if (!m) return null;
  const meeting = m as unknown as {
    id: string;
    title: string;
    starts_at: string;
    venue: string | null;
    meeting_type: MeetingType;
    sub_type: string | null;
    project_title: string | null;
    is_emergency: boolean;
    department_id: string;
    chair_id: string | null;
    secretary_id: string | null;
    chairperson_name: string | null;
    chairperson_id: string | null;
    adviser_name: string | null;
    adviser_id: string | null;
    panel_members: PanelMember[];
    guests: MeetingGuest[];
    meeting_participants: { user_id: string }[] | null;
  };

  const participantIds = (meeting.meeting_participants ?? []).map((p) => p.user_id);

  const [settingsRes, deptRes, minutesRes, tasksRes, attendanceRes, attachmentsRes] = await Promise.all([
    supabase.from('app_settings').select('institution_name').maybeSingle(),
    supabase.from('departments').select('name').eq('id', meeting.department_id).maybeSingle(),
    supabase
      .from('minutes')
      .select('status, call_to_order, previous_minutes, agenda_items, adjournment, signatures, paper_notes, locked_at')
      .eq('meeting_id', meetingId)
      .maybeSingle(),
    supabase.from('tasks').select('title, deadline, status, assignee_id').eq('meeting_id', meetingId),
    supabase.from('attendance').select('records').eq('meeting_id', meetingId).maybeSingle(),
    supabase.from('meeting_attachments').select('kind, file_name, caption, created_at').eq('meeting_id', meetingId).order('created_at'),
  ]);

  const taskRows = (tasksRes.data as { title: string; deadline: string | null; status: string; assignee_id: string | null }[] | null) ?? [];
  const profileIds = [
    ...new Set(
      [meeting.chair_id, meeting.secretary_id, meeting.chairperson_id, meeting.adviser_id, ...participantIds, ...taskRows.map((t) => t.assignee_id)].filter(
        Boolean,
      ) as string[],
    ),
  ];
  const { data: profiles } = profileIds.length
    ? await supabase.from('profiles').select('id, name, role, position').in('id', profileIds)
    : { data: [] as RosterPerson[] };
  const people = (profiles as RosterPerson[] | null) ?? [];
  const nameOf = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? null : null);

  const existing = ((attendanceRes.data?.records as AttendanceRecord[] | null) ?? []).map((r) => ({
    ...r,
    key: r.key ?? (r.userId ? `u:${r.userId}` : `g:${r.name}`),
    kind: r.kind ?? 'participant',
  }));
  const attendance = buildRoster({
    approverId: meeting.chair_id,
    chairpersonName: meeting.chairperson_name,
    chairpersonId: meeting.chairperson_id,
    panel: meeting.meeting_type === 'capstone' ? meeting.panel_members : [],
    adviserName: meeting.adviser_name,
    adviserId: meeting.adviser_id,
    participants: people.filter((p) => participantIds.includes(p.id) || p.id === meeting.chair_id),
    guests: meeting.guests,
    existing,
  });

  const mr = minutesRes.data as PrintableMeeting['minutes'] | null;

  return {
    institution: (settingsRes.data?.institution_name as string | undefined) ?? 'Zamboanga Peninsula Polytechnic State University',
    department: (deptRes.data?.name as string | undefined) ?? null,
    docTitle: docTitleFor(meeting),
    meeting: {
      id: meeting.id,
      title: meeting.title,
      starts_at: meeting.starts_at,
      venue: meeting.venue,
      meeting_type: meeting.meeting_type,
      sub_type: meeting.sub_type,
      project_title: meeting.project_title,
      is_emergency: meeting.is_emergency,
      chairperson_name: meeting.chairperson_name ?? nameOf(meeting.chairperson_id),
      adviser_name: meeting.adviser_name ?? nameOf(meeting.adviser_id),
      panel: meeting.panel_members ?? [],
    },
    presidingName: nameOf(meeting.chair_id),
    secretaryName: nameOf(meeting.secretary_id),
    minutes: mr
      ? {
          status: mr.status,
          call_to_order: mr.call_to_order ?? '',
          previous_minutes: mr.previous_minutes ?? '',
          agenda_items: mr.agenda_items ?? [],
          adjournment: mr.adjournment ?? '',
          signatures: mr.signatures ?? [],
          paper_notes: mr.paper_notes ?? [],
          locked_at: mr.locked_at,
        }
      : null,
    tasks: taskRows.map((t) => ({ title: t.title, assignee: nameOf(t.assignee_id), deadline: t.deadline, status: t.status })),
    attendance,
    attachments: (attachmentsRes.data as PrintableMeeting['attachments'] | null) ?? [],
  };
}
