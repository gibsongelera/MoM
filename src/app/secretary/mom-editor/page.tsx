import Link from 'next/link';
import { requireRole } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import MomEditor, { type AssignedTask, type MinutesDetail, type TeamMember } from '@/components/dashboard/MomEditor';
import type { MeetingType } from '@/lib/types/domain';

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
          <h1 className="font-h1 text-h1">Document Editor</h1>
          <p className="font-body-lg text-on-surface-variant">Draft, sign, and route the Minutes of the Meeting.</p>
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
                    {new Date(m.starts_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} · {m.sub_type ?? m.meeting_type}
                  </p>
                </div>
                <span className={`pill ${m.status === 'approved' ? 'pill-done' : 'pill-pending'}`}>{m.status.replace('_', ' ')}</span>
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
      'id, title, starts_at, venue, meeting_type, sub_type, project_title, department_id, chair_id, secretary_id, chairperson_id, adviser_id, panel_member_ids',
    )
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) {
    return (
      <>
        <header className="mb-lg">
          <Link href="/secretary/mom-editor" className="text-primary hover:underline font-label-caps text-label-caps">
            &larr; All documents
          </Link>
        </header>
        <p className="text-on-surface-variant">Meeting not found.</p>
      </>
    );
  }

  const [{ data: department }, { data: minutesRow }, { data: taskRows }, { data: team }] = await Promise.all([
    meeting.department_id
      ? supabase.from('departments').select('name').eq('id', meeting.department_id).single()
      : Promise.resolve({ data: null as { name: string } | null }),
    supabase
      .from('minutes')
      .select(
        'id, call_to_order, previous_minutes, agenda_items, adjournment, ai_action_items, signatures, comments, amendments, status, locked_at',
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
  ]);

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
      }
    : null;

  return (
    <>
      <div className="mb-md no-print">
        <Link href="/secretary/mom-editor" className="text-primary hover:underline font-label-caps text-label-caps">
          &larr; All documents
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
          chairId: meeting.chair_id,
          chairName: meeting.chair_id ? nameById.get(meeting.chair_id) ?? null : null,
          secretaryId: meeting.secretary_id,
          secretaryName: meeting.secretary_id ? nameById.get(meeting.secretary_id) ?? null : null,
          chairpersonName: meeting.chairperson_id ? nameById.get(meeting.chairperson_id) ?? null : null,
          adviserName: meeting.adviser_id ? nameById.get(meeting.adviser_id) ?? null : null,
          panelNames: (meeting.panel_member_ids ?? []).map((id: string) => nameById.get(id)).filter((n: string | undefined): n is string => Boolean(n)),
        }}
        initialMinutes={minutesDetail}
        tasks={tasks}
        team={teamMembers}
        currentUserId={user.id}
        currentUserName={user.name}
      />
    </>
  );
}
