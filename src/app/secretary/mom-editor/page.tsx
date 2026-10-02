import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import MomEditor, { type AssignedTask, type MinutesDetail, type PanelNotesPhoto, type TeamMember } from '@/components/dashboard/MomEditor';
import type { MeetingType, PanelMember } from '@/lib/types/domain';
import { fmtManilaDate } from '@/lib/utils/datetime';
import { MeetingStatusPill } from '@/components/ui/StatusPill';
import { Icon } from '@/components/ui/Icon';

export const metadata: Metadata = { title: 'Minutes | ZPPSU SmartMin' };

export default async function MomEditorPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const user = await requireRole('secretary');
  const { m: meetingId } = await searchParams;
  const supabase = await createClient();

  if (!meetingId) {
    const { data: meetings } = await supabase
      .from('meetings')
      .select('id, title, starts_at, meeting_type, sub_type, status')
      .order('starts_at', { ascending: false });

    return (
      <>
        <header className="mb-lg">
          <h1 className="font-h1 text-h1">Minutes</h1>
          <p className="font-body-lg text-on-surface-variant">Write, sign and route the minutes of each meeting for approval.</p>
        </header>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl divide-y divide-outline-variant">
          {(meetings ?? []).length === 0 ? (
            <p className="p-md text-on-surface-variant">No meetings yet.</p>
          ) : (
            (meetings ?? []).map((m) => (
              <Link key={m.id} href={`/secretary/mom-editor?m=${m.id}`} className="p-md flex items-center justify-between hover:bg-surface-container-low transition-colors">
                <div>
                  <p className="font-body-md font-semibold">{m.title}</p>
                  <p className="font-caption text-caption text-on-surface-variant">
                    {fmtManilaDate(m.starts_at)} · {m.sub_type ?? m.meeting_type}
                  </p>
                </div>
                <MeetingStatusPill status={m.status} />
              </Link>
            ))
          )}
        </div>
      </>
    );
  }

  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select(
      'id, title, starts_at, venue, meeting_type, sub_type, project_title, department_id, chair_id, secretary_id, chairperson_id, adviser_id, panel_member_ids, chairperson_name, adviser_name, panel_members',
    )
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) {
    return (
      <>
        <header className="mb-lg">
          <Link href="/secretary/mom-editor" className="inline-flex items-center gap-xs text-primary hover:underline font-body-sm">
            <Icon name="arrow_back" size={16} /> All minutes
          </Link>
        </header>
        <p className="text-on-surface-variant">Meeting not found.</p>
      </>
    );
  }

  const [{ data: department }, { data: minutesRow }, { data: taskRows }, { data: team }, { data: photoRows }] = await Promise.all([
    meeting.department_id
      ? supabase.from('departments').select('name').eq('id', meeting.department_id).single()
      : Promise.resolve({ data: null as { name: string } | null }),
    supabase
      .from('minutes')
      .select(
        'id, call_to_order, previous_minutes, agenda_items, adjournment, ai_action_items, signatures, comments, amendments, status, locked_at, paper_notes',
      )
      .eq('meeting_id', meetingId)
      .maybeSingle(),
    supabase
      .from('tasks')
      .select('id, title, deadline, status, assignee_id')
      .eq('meeting_id', meetingId),
    meeting.department_id
      ? supabase.from('profiles').select('id, name').eq('department_id', meeting.department_id).eq('active', true)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase
      .from('meeting_attachments')
      .select('id, file_name, caption, storage_path')
      .eq('meeting_id', meetingId)
      .eq('kind', 'panel_notes')
      .order('created_at'),
  ]);

  const photos = (photoRows as { id: string; file_name: string; caption: string | null; storage_path: string }[] | null) ?? [];
  const signedPhotos = photos.length
    ? (await supabase.storage.from('meeting-attachments').createSignedUrls(photos.map((p) => p.storage_path), 3600)).data ?? []
    : [];
  const panelPhotos: PanelNotesPhoto[] = photos.map((p, i) => ({
    id: p.id,
    file_name: p.file_name,
    caption: p.caption,
    url: signedPhotos[i]?.signedUrl ?? null,
  }));

  const roleIds = [meeting.chair_id, meeting.secretary_id, meeting.chairperson_id, meeting.adviser_id, ...(meeting.panel_member_ids ?? [])].filter(
    (id: string | null): id is string => Boolean(id),
  );
  const assigneeIds = (taskRows ?? []).map((t) => t.assignee_id).filter((id): id is string => Boolean(id));
  const allProfileIds = Array.from(new Set([...roleIds, ...assigneeIds]));

  const { data: profileRows } = allProfileIds.length
    ? await supabase.from('profiles').select('id, name').in('id', allProfileIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((profileRows ?? []).map((p) => [p.id, p.name]));

  const tasks: AssignedTask[] = (taskRows ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    assignee_name: t.assignee_id ? nameById.get(t.assignee_id) ?? null : null,
    deadline: t.deadline,
    status: t.status,
  }));

  const teamMembers: TeamMember[] = team ?? [];

  const minutesDetail: MinutesDetail | null = minutesRow
    ? {
        id: minutesRow.id,
        call_to_order: minutesRow.call_to_order ?? '',
        previous_minutes: minutesRow.previous_minutes ?? '',
        agenda_items: minutesRow.agenda_items ?? [],
        adjournment: minutesRow.adjournment ?? '',
        ai_action_items: minutesRow.ai_action_items ?? [],
        signatures: minutesRow.signatures ?? [],
        comments: minutesRow.comments ?? [],
        amendments: minutesRow.amendments ?? [],
        status: minutesRow.status,
        locked_at: minutesRow.locked_at,
        paper_notes: minutesRow.paper_notes ?? [],
      }
    : null;

  return (
    <>
      <div className="mb-md no-print">
        <Link href={`/secretary/meetings/${meeting.id}?step=minutes`} className="inline-flex items-center gap-xs text-primary hover:underline font-body-sm">
          <Icon name="arrow_back" size={16} /> Back to the meeting
        </Link>
      </div>
      <MomEditor
        meeting={{
          id: meeting.id,
          title: meeting.title,
          starts_at: meeting.starts_at,
          venue: meeting.venue,
          meeting_type: meeting.meeting_type as MeetingType,
          sub_type: meeting.sub_type,
          project_title: meeting.project_title,
          departmentName: department?.name ?? null,
          departmentId: meeting.department_id ?? null,
          chairId: meeting.chair_id,
          chairName: meeting.chair_id ? nameById.get(meeting.chair_id) ?? null : null,
          secretaryId: meeting.secretary_id,
          secretaryName: meeting.secretary_id ? nameById.get(meeting.secretary_id) ?? null : null,
          chairpersonName: meeting.chairperson_name ?? (meeting.chairperson_id ? nameById.get(meeting.chairperson_id) ?? null : null),
          adviserName: meeting.adviser_name ?? (meeting.adviser_id ? nameById.get(meeting.adviser_id) ?? null : null),
          panelNames: ((meeting.panel_members ?? []) as PanelMember[]).map((p) => (p.affiliation ? `${p.name} (${p.affiliation})` : p.name)),
        }}
        initialMinutes={minutesDetail}
        tasks={tasks}
        team={teamMembers}
        currentUserId={user.id}
        currentUserName={user.name}
        panelPhotos={panelPhotos}
      />
    </>
  );
}
