// Async data access over the real Supabase schema (supabase/migrations/*).
// Maps the DB's snake_case rows to the app's camelCase types in lib/types.ts,
// so component rendering code is unchanged. Privileged writes (audit,
// notifications, minutes lock/amend/sign, comments) go through the SECURITY
// DEFINER RPCs from 0003_functions.sql — RLS blocks direct writes to those.
import { createClient } from '@/lib/supabase/client';
import type {
  Attendance,
  AudioRecording,
  AuditEntry,
  Comment,
  Department,
  Meeting,
  Minutes,
  Notification,
  PersonalMeeting,
  Settings,
  Task,
  Taxonomy,
  Transcript,
  User,
} from './types';

const supabase = () => createClient();

// ============================================================
// Timezone helpers — the schema stores meetings.starts_at as timestamptz
// (UTC), but the UI treats meeting.date / personal times as naive local
// strings in Philippine time. Convert on the boundary.
// ============================================================
const MANILA = 'Asia/Manila';

export function tsToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

export function localInputToTs(local: string): string {
  if (!local) return new Date().toISOString();
  const withOffset = /[+-]\d\d:?\d\d$/.test(local)
    ? local
    : `${local.length === 16 ? local + ':00' : local}+08:00`;
  return new Date(withOffset).toISOString();
}

// ============================================================
// Row -> app-type mappers
// ============================================================
type Row = Record<string, any>;

export const mapUser = (r: Row): User => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  departmentId: r.department_id ?? '',
  position: r.position ?? '',
  active: r.active,
  joinedAt: r.joined_at ?? undefined,
  photoPath: r.photo_path ?? '',
  photoDataUrl: '', // resolved to a signed Storage URL by the DataProvider / auth
});

export const mapDepartment = (r: Row): Department => ({
  id: r.id,
  name: r.name,
  short: r.short,
  type: r.type,
  headId: r.head_id ?? '',
  officeLocation: r.office_location ?? '',
});

export const mapMeeting = (r: Row): Meeting => ({
  id: r.id,
  title: r.title,
  date: tsToLocalInput(r.starts_at),
  durationMin: r.duration_min ?? undefined,
  venue: r.venue ?? '',
  departmentId: r.department_id ?? '',
  chairId: r.chair_id ?? '',
  secretaryId: r.secretary_id ?? '',
  participantIds: Array.isArray(r.meeting_participants)
    ? r.meeting_participants.map((p: Row) => p.user_id)
    : (r.participant_ids ?? []),
  agenda: r.agenda ?? [],
  status: r.status,
  aiProcessed: r.ai_processed,
  language: r.language ?? undefined,
  meetingType: r.meeting_type ?? undefined,
  subType: r.sub_type ?? '',
  projectTitle: r.project_title ?? '',
  chairpersonId: r.chairperson_id ?? '',
  panelMemberIds: r.panel_member_ids ?? [],
  adviserId: r.adviser_id ?? '',
  rsvps: r.rsvps ?? {},
  // transcriptId / minutesId are stitched in by the DataProvider.
});

export async function setMeetingRsvp(meetingId: string, status: string) {
  const { error } = await supabase().rpc('set_meeting_rsvp', { p_meeting_id: meetingId, p_status: status });
  if (error) throw error;
}

export const mapTranscript = (r: Row): Transcript => ({
  id: r.id,
  meetingId: r.meeting_id,
  language: r.language ?? undefined,
  segments: r.segments ?? [],
  summary: r.summary ?? undefined,
  translatedTo: r.translated_to ?? null,
  confidence: r.confidence ?? undefined,
  comments: r.comments ?? [],
  keyDecisions: r.key_decisions ?? [],
});

export const mapMinutes = (r: Row): Minutes => ({
  id: r.id,
  meetingId: r.meeting_id,
  status: r.status,
  documentTitle: r.document_title ?? undefined,
  callToOrder: r.call_to_order ?? undefined,
  previousMinutes: r.previous_minutes ?? undefined,
  agendaItems: r.agenda_items ?? [],
  actionItems: r.action_items ?? [],
  adjournment: r.adjournment ?? undefined,
  signatures: r.signatures ?? [],
  comments: r.comments ?? [],
  amendments: r.amendments ?? [],
  lockedAt: r.locked_at ? Date.parse(r.locked_at) : null,
  lockedBy: r.locked_by ?? null,
  paperNotes: r.paper_notes ?? [],
  translatedTo: r.translated_to ?? null,
  motions: r.motions ?? [],
  versions: r.versions ?? [],
});

export const mapTask = (r: Row): Task => ({
  id: r.id,
  title: r.title,
  description: r.description ?? '',
  meetingId: r.meeting_id ?? undefined,
  departmentId: r.department_id ?? undefined,
  assigneeId: r.assignee_id ?? undefined,
  delegatedBy: r.delegated_by ?? undefined,
  priority: r.priority ?? undefined,
  deadline: r.deadline ?? undefined,
  status: r.status,
  aiExtracted: r.ai_extracted,
});

export const mapPersonalMeeting = (r: Row): PersonalMeeting => ({
  id: r.id,
  userId: r.user_id,
  date: r.meeting_date,
  time: (r.meeting_time ?? '').slice(0, 5),
  type: r.type ?? '',
  title: r.title,
  attendees: r.attendees ?? '',
  notes: r.notes ?? '',
});

export const mapNotification = (r: Row): Notification => ({
  id: r.id,
  ts: r.created_at ? Date.parse(r.created_at) : Date.now(),
  read: r.read,
  type: r.type,
  title: r.title,
  body: r.body ?? '',
  userId: r.user_id,
});

export const mapAudit = (r: Row): AuditEntry => ({
  id: r.id,
  ts: r.created_at ? Date.parse(r.created_at) : Date.now(),
  action: r.action,
  detail: r.detail ?? '',
  userId: r.user_id ?? 'anonymous',
  userName: r.user_name ?? 'Anonymous',
  role: r.role ?? 'guest',
});

export const mapAttendance = (r: Row): Attendance => ({
  id: r.id,
  meetingId: r.meeting_id,
  startedAt: r.started_at ?? 0,
  records: r.records ?? [],
});

export const mapAudioRecording = (r: Row): AudioRecording => ({
  id: r.id,
  meetingId: r.meeting_id,
  storagePath: r.storage_path,
  durationSec: r.duration_sec ?? 0,
  language: r.language ?? undefined,
  createdAt: r.created_at ? Date.parse(r.created_at) : undefined,
});

// ============================================================
// Loaders (RLS-scoped by the caller's session)
// ============================================================
export async function loadAll(role: string) {
  const sb = supabase();
  const [
    departments,
    users,
    meetings,
    tasks,
    transcripts,
    minutes,
    personalMeetings,
    notifications,
    attendance,
    settings,
    subtypes,
    audit,
    audioRecordings,
  ] = await Promise.all([
    sb.from('departments').select('*').order('short'),
    sb.from('profiles').select('*').order('name'),
    sb.from('meetings').select('*, meeting_participants(user_id)').order('starts_at', { ascending: false }),
    sb.from('tasks').select('*'),
    sb.from('transcripts').select('*'),
    sb.from('minutes').select('*'),
    sb.from('personal_meetings').select('*').order('meeting_date', { ascending: false }),
    sb.from('notifications').select('*').order('created_at', { ascending: false }),
    sb.from('attendance').select('*'),
    sb.from('app_settings').select('*').maybeSingle(),
    sb.from('meeting_subtypes').select('*').order('position'),
    role === 'admin'
      ? sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(200)
      : Promise.resolve({ data: [], error: null } as any),
    sb.from('audio_recordings').select('*').order('created_at', { ascending: false }),
  ]);

  const firstError = [
    departments, users, meetings, tasks, transcripts, minutes,
    personalMeetings, notifications, attendance, settings, subtypes, audit, audioRecordings,
  ].find((r: any) => r.error)?.error;
  if (firstError) throw firstError;

  const mMeetings = (meetings.data ?? []).map(mapMeeting);
  const mTranscripts = (transcripts.data ?? []).map(mapTranscript);
  const mMinutes = (minutes.data ?? []).map(mapMinutes);
  // Stitch transcript/minutes ids onto meetings.
  for (const mt of mMeetings) {
    mt.transcriptId = mTranscripts.find((t) => t.meetingId === mt.id)?.id;
    mt.minutesId = mMinutes.find((m) => m.meetingId === mt.id)?.id;
  }

  return {
    departments: (departments.data ?? []).map(mapDepartment),
    users: (users.data ?? []).map(mapUser),
    meetings: mMeetings,
    tasks: (tasks.data ?? []).map(mapTask),
    transcripts: mTranscripts,
    minutes: mMinutes,
    personalMeetings: (personalMeetings.data ?? []).map(mapPersonalMeeting),
    notifications: (notifications.data ?? []).map(mapNotification),
    attendance: (attendance.data ?? []).map(mapAttendance),
    settings: settings.data ? mapSettings(settings.data) : defaultSettings(),
    taxonomy: mapTaxonomy(subtypes.data ?? []),
    audit: (audit.data ?? []).map(mapAudit),
    audioRecordings: (audioRecordings.data ?? []).map(mapAudioRecording),
  };
}

export function defaultSettings(): Settings {
  return {
    aiEnabled: true,
    autoTranscribe: true,
    autoSummarize: true,
    autoUploadOnReconnect: true,
    localProcessingOnly: false,
    retentionDays: 365,
    defaultLanguage: 'en-US',
    institutionName: 'Zamboanga Peninsula Polytechnic State University',
    institutionShort: 'ZPPSU',
  };
}

export const mapSettings = (r: Row): Settings => ({
  aiEnabled: r.ai_enabled,
  autoTranscribe: r.auto_transcribe,
  autoSummarize: r.auto_summarize,
  autoUploadOnReconnect: r.auto_upload_on_reconnect,
  localProcessingOnly: r.local_processing_only,
  retentionDays: r.retention_days,
  defaultLanguage: r.default_language,
  institutionName: r.institution_name,
  institutionShort: r.institution_short,
});

export const mapTaxonomy = (rows: Row[]): Taxonomy => ({
  capstone: rows.filter((r) => r.meeting_type === 'capstone').map((r) => r.label),
  research: rows.filter((r) => r.meeting_type === 'research').map((r) => r.label),
});

// ============================================================
// Mutations
// ============================================================

/** Append an audit entry (RPC — actor is the session, never trusted input). */
export async function logAudit(action: string, detail = '') {
  try {
    await supabase().rpc('log_audit', { p_action: action, p_detail: detail });
  } catch {
    /* non-fatal */
  }
}

/** Raise a notification for another user (RPC — notifications have no INSERT policy). */
export async function notifyUser(userId: string, type: string, title: string, body = '') {
  if (!userId) return;
  try {
    await supabase().rpc('notify_user', { p_user_id: userId, p_type: type, p_title: title, p_body: body });
  } catch {
    /* non-fatal */
  }
}

/** Replace the capstone/research subtype reference lists (admin taxonomy editor). */
export async function setTaxonomy(tax: Taxonomy) {
  const sb = supabase();
  await sb.from('meeting_subtypes').delete().in('meeting_type', ['capstone', 'research']);
  const rows = [
    ...tax.capstone.map((label, i) => ({ meeting_type: 'capstone', label, position: i })),
    ...tax.research.map((label, i) => ({ meeting_type: 'research', label, position: i })),
  ];
  if (rows.length) {
    const { error } = await sb.from('meeting_subtypes').insert(rows);
    if (error) throw error;
  }
}

/** Fuzzy-match an AI-suggested assignee name to a real user id (rec #3). */
export function matchUserIdByName(
  name: string | undefined,
  users: User[],
  candidateIds?: string[],
): string | undefined {
  const n = (name || '').trim().toLowerCase();
  if (!n) return undefined;
  const pool = candidateIds && candidateIds.length ? users.filter((u) => candidateIds.includes(u.id)) : users;
  const exact = pool.find((u) => u.name.toLowerCase() === n);
  if (exact) return exact.id;
  const partial = pool.find((u) => u.name.toLowerCase().includes(n) || n.includes(u.name.toLowerCase()));
  if (partial) return partial.id;
  const tokens = n.split(/\s+/).filter((t) => t.length > 2);
  const byToken = pool.find((u) => {
    const un = u.name.toLowerCase();
    return tokens.some((t) => un.includes(t));
  });
  return byToken?.id;
}

export async function saveTask(t: Partial<Task> & { id?: string }): Promise<Task> {
  const row: Row = {
    title: t.title,
    description: t.description ?? null,
    meeting_id: t.meetingId ?? null,
    department_id: t.departmentId ?? null,
    assignee_id: t.assigneeId ?? null,
    delegated_by: t.delegatedBy ?? null,
    priority: t.priority ?? 'medium',
    deadline: t.deadline || null,
    status: t.status ?? 'pending',
    ai_extracted: t.aiExtracted ?? false,
  };
  const sb = supabase();
  if (t.id) {
    const { data, error } = await sb.from('tasks').update(row).eq('id', t.id).select('*').single();
    if (error) throw error;
    return mapTask(data);
  }
  const { data, error } = await sb.from('tasks').insert(row).select('*').single();
  if (error) throw error;
  return mapTask(data);
}

export async function updateTaskStatus(id: string, status: Task['status']) {
  const { data, error } = await supabase().from('tasks').update({ status }).eq('id', id).select('*').single();
  if (error) throw error;
  return mapTask(data);
}

export async function deleteTask(id: string) {
  const { error } = await supabase().from('tasks').delete().eq('id', id);
  if (error) throw error;
}

/** Insert or update a meeting and reconcile its participant join rows. */
export async function saveMeeting(m: Partial<Meeting> & { id?: string }): Promise<Meeting> {
  const row: Row = {
    title: m.title,
    starts_at: m.date ? localInputToTs(m.date) : new Date().toISOString(),
    duration_min: m.durationMin ?? 60,
    venue: m.venue ?? null,
    department_id: m.departmentId,
    chair_id: m.chairId || null,
    secretary_id: m.secretaryId || null,
    agenda: m.agenda ?? [],
    status: m.status ?? 'scheduled',
    ai_processed: m.aiProcessed ?? false,
    language: m.language ?? 'en-US',
    meeting_type: m.meetingType ?? 'regular',
    sub_type: m.subType || null,
    project_title: m.projectTitle || null,
    chairperson_id: m.chairpersonId || null,
    panel_member_ids: m.panelMemberIds ?? [],
    adviser_id: m.adviserId || null,
  };
  const sb = supabase();
  let id = m.id;
  if (id) {
    const { error } = await sb.from('meetings').update(row).eq('id', id);
    if (error) throw error;
  } else {
    const { data, error } = await sb.from('meetings').insert(row).select('id').single();
    if (error) throw error;
    id = data.id;
  }
  // Reconcile participants.
  if (m.participantIds) {
    await sb.from('meeting_participants').delete().eq('meeting_id', id);
    if (m.participantIds.length) {
      const rows = m.participantIds.map((uid) => ({ meeting_id: id, user_id: uid }));
      const { error } = await sb.from('meeting_participants').upsert(rows, { onConflict: 'meeting_id,user_id' });
      if (error) throw error;
    }
  }
  const { data, error } = await sb
    .from('meetings')
    .select('*, meeting_participants(user_id)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return mapMeeting(data);
}

export async function deleteMeeting(id: string) {
  const { error } = await supabase().from('meetings').delete().eq('id', id);
  if (error) throw error;
}

/** Partial meeting update — only the provided fields are touched. */
export async function updateMeetingFields(id: string, patch: Partial<Meeting>) {
  const row: Row = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.date !== undefined) row.starts_at = localInputToTs(patch.date);
  if (patch.durationMin !== undefined) row.duration_min = patch.durationMin;
  if (patch.venue !== undefined) row.venue = patch.venue;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.aiProcessed !== undefined) row.ai_processed = patch.aiProcessed;
  if (patch.language !== undefined) row.language = patch.language;
  if (patch.meetingType !== undefined) row.meeting_type = patch.meetingType;
  if (patch.subType !== undefined) row.sub_type = patch.subType || null;
  if (patch.projectTitle !== undefined) row.project_title = patch.projectTitle || null;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase().from('meetings').update(row).eq('id', id);
  if (error) throw error;
}

/** Upsert a transcript keyed on its meeting. */
export async function saveTranscript(t: Partial<Transcript> & { meetingId: string }): Promise<Transcript> {
  const row: Row = {
    meeting_id: t.meetingId,
    language: t.language ?? 'en-US',
    segments: t.segments ?? [],
    summary: t.summary ?? null,
    translated_to: t.translatedTo ?? null,
    confidence: t.confidence ?? null,
    key_decisions: t.keyDecisions ?? [],
  };
  const sb = supabase();
  const { data: existing } = await sb.from('transcripts').select('id').eq('meeting_id', t.meetingId).maybeSingle();
  if (existing) {
    const { data, error } = await sb.from('transcripts').update(row).eq('id', existing.id).select('*').single();
    if (error) throw error;
    return mapTranscript(data);
  }
  const { data, error } = await sb.from('transcripts').insert(row).select('*').single();
  if (error) throw error;
  return mapTranscript(data);
}

export async function deleteTranscript(id: string) {
  const { error } = await supabase().from('transcripts').delete().eq('id', id);
  if (error) throw error;
}

/** Update just the comments array on a transcript (secretary/chair/admin). */
export async function updateTranscriptComments(transcriptId: string, comments: Comment[]) {
  const { error } = await supabase().from('transcripts').update({ comments }).eq('id', transcriptId);
  if (error) throw error;
}

/** Update just the comments array on a minutes doc. */
export async function updateMinutesComments(minutesId: string, comments: Comment[]) {
  const { error } = await supabase().from('minutes').update({ comments }).eq('id', minutesId);
  if (error) throw error;
}

/** Update editable minutes fields (blocked by RLS when locked). */
export async function saveMinutes(m: Partial<Minutes> & { id?: string; meetingId: string }): Promise<Minutes> {
  const row: Row = {
    meeting_id: m.meetingId,
    document_title: m.documentTitle ?? null,
    call_to_order: m.callToOrder ?? null,
    previous_minutes: m.previousMinutes ?? null,
    agenda_items: m.agendaItems ?? [],
    action_items: m.actionItems ?? [],
    adjournment: m.adjournment ?? null,
    paper_notes: m.paperNotes ?? [],
    translated_to: m.translatedTo ?? null,
    ...(m.status ? { status: m.status } : {}),
    ...(m.motions !== undefined ? { motions: m.motions } : {}),
    ...(m.versions !== undefined ? { versions: m.versions } : {}),
  };
  const sb = supabase();
  const { data, error } = await sb.from('minutes').upsert(row, { onConflict: 'meeting_id' }).select('*').single();
  if (error) throw error;
  return mapMinutes(data);
}

/** Head returns pending minutes to the secretary for revision (rec #9). */
export async function returnMinutes(minutesId: string, meetingId: string, secretaryId: string | undefined, reason: string, byName: string) {
  const sb = supabase();
  const { data, error } = await sb
    .from('minutes')
    .update({ status: 'draft' })
    .eq('id', minutesId)
    .select('*')
    .single();
  if (error) throw error;
  // Bounce the meeting back to transcribed so it re-enters the queue when re-routed.
  await sb.from('meetings').update({ status: 'transcribed' }).eq('id', meetingId);
  if (secretaryId) {
    await notifyUser(secretaryId, 'approval', 'Minutes returned for revision', `${byName} returned the minutes: ${reason}`);
  }
  return data ? mapMinutes(data) : null;
}

// Minutes state machine — all via SECURITY DEFINER RPCs.
export async function lockMinutes(minutesId: string) {
  const { data, error } = await supabase().rpc('lock_minutes', { p_minutes_id: minutesId });
  if (error) throw error;
  return data ? mapMinutes(data) : null;
}
export async function amendMinutes(minutesId: string, summary?: string) {
  const { data, error } = await supabase().rpc('amend_minutes', { p_minutes_id: minutesId, p_summary: summary ?? null });
  if (error) throw error;
  return data ? mapMinutes(data) : null;
}
export async function signMinutes(minutesId: string, roleLabel: string, dataUrl?: string) {
  const { data, error } = await supabase().rpc('sign_minutes', {
    p_minutes_id: minutesId,
    p_role_label: roleLabel,
    p_data_url: dataUrl ?? null,
  });
  if (error) throw error;
  return data ? mapMinutes(data) : null;
}
export async function routeMinutesForApproval(minutesId: string) {
  const { data, error } = await supabase().rpc('route_minutes_for_approval', { p_minutes_id: minutesId });
  if (error) throw error;
  return data ? mapMinutes(data) : null;
}
export async function appendTranscriptComment(transcriptId: string, text: string) {
  const { error } = await supabase().rpc('append_transcript_comment', { p_transcript_id: transcriptId, p_text: text });
  if (error) throw error;
}
export async function appendMinutesComment(minutesId: string, text: string) {
  const { error } = await supabase().rpc('append_minutes_comment', { p_minutes_id: minutesId, p_text: text });
  if (error) throw error;
}

export async function savePersonalMeeting(p: Partial<PersonalMeeting> & { id?: string; userId: string }): Promise<PersonalMeeting> {
  const row: Row = {
    user_id: p.userId,
    meeting_date: p.date,
    meeting_time: p.time || null,
    type: p.type ?? null,
    title: p.title,
    attendees: p.attendees ?? null,
    notes: p.notes ?? null,
  };
  const sb = supabase();
  if (p.id) {
    const { data, error } = await sb.from('personal_meetings').update(row).eq('id', p.id).select('*').single();
    if (error) throw error;
    return mapPersonalMeeting(data);
  }
  const { data, error } = await sb.from('personal_meetings').insert(row).select('*').single();
  if (error) throw error;
  return mapPersonalMeeting(data);
}

export async function deletePersonalMeeting(id: string) {
  const { error } = await supabase().from('personal_meetings').delete().eq('id', id);
  if (error) throw error;
}

export async function saveAttendance(a: Partial<Attendance> & { meetingId: string }): Promise<Attendance> {
  const row: Row = {
    meeting_id: a.meetingId,
    started_at: a.startedAt ?? Date.now(),
    records: a.records ?? [],
  };
  const { data, error } = await supabase()
    .from('attendance')
    .upsert(row, { onConflict: 'meeting_id' })
    .select('*')
    .single();
  if (error) throw error;
  return mapAttendance(data);
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase().from('notifications').update({ read: true }).eq('id', id);
  if (error) throw error;
}

/** Mark every unread notification of the current user as read (RLS scopes to self). */
export async function markAllNotificationsRead() {
  const { error } = await supabase().from('notifications').update({ read: true }).eq('read', false);
  if (error) throw error;
}

export async function updateProfile(id: string, patch: Partial<User>) {
  const row: Row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.position !== undefined) row.position = patch.position;
  if (patch.departmentId !== undefined) row.department_id = patch.departmentId || null;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.photoPath !== undefined) row.photo_path = patch.photoPath || null;
  const { data, error } = await supabase().from('profiles').update(row).eq('id', id).select('*').single();
  if (error) throw error;
  return mapUser(data);
}

export async function saveDepartment(d: Partial<Department> & { id?: string }): Promise<Department> {
  const row: Row = {
    name: d.name,
    short: d.short,
    // DB enum department_type is ('college','office'); map the app's extra
    // 'department' onto 'office'.
    type: d.type === 'department' ? 'office' : (d.type ?? 'college'),
    head_id: d.headId || null,
    office_location: d.officeLocation ?? null,
  };
  const sb = supabase();
  if (d.id) {
    const { data, error } = await sb.from('departments').update(row).eq('id', d.id).select('*').single();
    if (error) throw error;
    return mapDepartment(data);
  }
  const { data, error } = await sb.from('departments').insert(row).select('*').single();
  if (error) throw error;
  return mapDepartment(data);
}

export async function deleteDepartment(id: string) {
  const { error } = await supabase().from('departments').delete().eq('id', id);
  if (error) throw error;
}

export async function setSettings(patch: Partial<Settings>) {
  const row: Row = { id: true };
  if (patch.aiEnabled !== undefined) row.ai_enabled = patch.aiEnabled;
  if (patch.autoTranscribe !== undefined) row.auto_transcribe = patch.autoTranscribe;
  if (patch.autoSummarize !== undefined) row.auto_summarize = patch.autoSummarize;
  if (patch.autoUploadOnReconnect !== undefined) row.auto_upload_on_reconnect = patch.autoUploadOnReconnect;
  if (patch.localProcessingOnly !== undefined) row.local_processing_only = patch.localProcessingOnly;
  if (patch.retentionDays !== undefined) row.retention_days = patch.retentionDays;
  if (patch.defaultLanguage !== undefined) row.default_language = patch.defaultLanguage;
  if (patch.institutionName !== undefined) row.institution_name = patch.institutionName;
  if (patch.institutionShort !== undefined) row.institution_short = patch.institutionShort;
  const { data, error } = await supabase().from('app_settings').upsert(row, { onConflict: 'id' }).select('*').single();
  if (error) throw error;
  return mapSettings(data);
}
