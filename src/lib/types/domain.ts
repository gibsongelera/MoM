/**
 * Domain types, mirroring supabase/migrations/0001_schema.sql.
 *
 * Hand-written rather than generated so the app type-checks before the database
 * exists. Once the migrations are applied, `npm run db:types` regenerates the
 * full `Database` type from the live schema and these can be narrowed to it.
 */

export type UserRole = 'admin' | 'head' | 'secretary' | 'faculty';
export type DepartmentType = 'college' | 'office';
export type MeetingType = 'regular' | 'capstone' | 'research';
export type MeetingStatus =
  | 'scheduled'
  | 'recording'
  | 'transcribed'
  | 'pending_approval'
  | 'approved'
  | 'archived';
export type MinutesStatus = 'draft' | 'pending_approval' | 'approved';
export type TaskStatus = 'pending' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'System Administrator',
  head: 'College Dean / Head',
  secretary: 'Faculty Secretary',
  faculty: 'Faculty Member',
};

/** Where each role lands after login. Single source of truth for both the
 * post-login redirect (login/page.tsx) and the signed-in-user-hits-/register
 * redirect (lib/supabase/middleware.ts) - keeping one file importable from
 * both a client component and edge middleware without pulling in
 * @supabase/ssr on the client bundle. */
export const ROLE_DASHBOARDS: Record<UserRole, string> = {
  admin: '/admin',
  head: '/head',
  secretary: '/secretary',
  faculty: '/faculty',
};

export interface Department {
  id: string;
  name: string;
  short: string;
  type: DepartmentType;
  head_id: string | null;
  office_location: string | null;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department_id: string | null;
  position: string | null;
  active: boolean;
  joined_at: string | null;
  photo_path: string | null;
}

export interface Meeting {
  id: string;
  title: string;
  starts_at: string;
  duration_min: number;
  venue: string | null;
  department_id: string;
  chair_id: string | null;
  secretary_id: string | null;
  agenda: string[];
  status: MeetingStatus;
  ai_processed: boolean;
  language: string;
  meeting_type: MeetingType;
  sub_type: string | null;
  project_title: string | null;
  chairperson_id: string | null;
  panel_member_ids: string[];
  adviser_id: string | null;
  /** 0016: unscheduled ("biglaan") meeting started on the spot. */
  is_emergency: boolean;
  /** 0016: participants without an account, typed by name. */
  guests: MeetingGuest[];
  /** 0016: typed capstone chairperson (chairperson_id is the optional linked account). */
  chairperson_name: string | null;
  /** 0016: typed panel; panel_member_ids is synced from the linked userIds. */
  panel_members: PanelMember[];
  adviser_name: string | null;
  created_at: string;
  updated_at: string;
}

/** Someone at the meeting who has no SmartMin account. */
export interface MeetingGuest {
  id: string;
  name: string;
  affiliation?: string | null;
}

/** A panel member: a typed name, optionally linked to an account. */
export interface PanelMember {
  name: string;
  userId?: string | null;
  affiliation?: string | null;
}

/** A directory entry offered as a suggestion in people pickers. */
export interface PersonOption {
  id: string;
  name: string;
  position?: string | null;
  role?: UserRole;
  department_short?: string | null;
}

/** One line of dialogue. `t` is seconds from the start of the recording. */
export interface TranscriptSegment {
  speakerId: string | null;
  speaker: string;
  t: number;
  text: string;
}

export interface ThreadComment {
  id: string;
  ts: number;
  userId: string | null;
  name: string;
  text: string;
}

export interface Transcript {
  id: string;
  meeting_id: string;
  language: string;
  segments: TranscriptSegment[];
  summary: string | null;
  translated_to: string | null;
  confidence: number | null;
  comments: ThreadComment[];
  source_audio_id: string | null;
  ai_model: string | null;
  provider: string | null;
  detected_language: string | null;
  diarized: boolean;
  created_at: string;
  updated_at: string;
}

export type TranscriptionStatus =
  | 'queued'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TranscriptionJob {
  id: string;
  meeting_id: string;
  audio_id: string;
  provider: string;
  provider_job_id: string | null;
  model: string | null;
  requested_language: string | null;
  detected_language: string | null;
  language_probability: number | null;
  diarize: boolean;
  keyterms: string[];
  status: TranscriptionStatus;
  error_code: string | null;
  error_detail: string | null;
  attempts: number;
  raw_response: unknown;
  transcript_id: string | null;
  audio_duration_sec: number | null;
  cost_usd: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TranscriptSpeaker {
  transcript_id: string;
  speaker_label: string;
  profile_id: string | null;
  display_name: string;
}

export interface AgendaItem {
  title: string;
  notes: string;
}

export interface Signature {
  userId: string;
  name: string;
  role: string;
  signedAt: number;
  dataUrl: string;
}

export interface Amendment {
  ts: number;
  byUserId: string;
  byName: string;
  summary: string;
}

export interface Minutes {
  id: string;
  meeting_id: string;
  document_title: string | null;
  call_to_order: string | null;
  previous_minutes: string | null;
  agenda_items: AgendaItem[];
  adjournment: string | null;
  ai_summary: string | null;
  signatures: Signature[];
  comments: ThreadComment[];
  amendments: Amendment[];
  ai_action_items: ExtractedActionItem[];
  status: MinutesStatus;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  meeting_id: string | null;
  department_id: string | null;
  assignee_id: string | null;
  delegated_by: string | null;
  priority: TaskPriority;
  deadline: string | null;
  status: TaskStatus;
  ai_extracted: boolean;
  confidence: number | null;
  created_at: string;
  updated_at: string;
}

export interface PersonalMeeting {
  id: string;
  user_id: string;
  meeting_date: string;
  meeting_time: string | null;
  type: string | null;
  title: string;
  attendees: string | null;
  notes: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  user_id: string | null;
  user_name: string | null;
  role: UserRole | null;
  action: string;
  detail: string | null;
  created_at: string;
}

export interface AppSettings {
  id: boolean;
  ai_enabled: boolean;
  auto_transcribe: boolean;
  auto_summarize: boolean;
  auto_upload_on_reconnect: boolean;
  local_processing_only: boolean;
  retention_days: number;
  default_language: string;
  institution_name: string;
  institution_short: string;
  data_processing_notice: string;
}

export interface AudioRecording {
  id: string;
  meeting_id: string | null;
  storage_path: string | null;
  duration_sec: number;
  language: string;
  mime_type: string;
  captured_at: string;
  uploaded_at: string | null;
  created_by: string | null;
}

/** An action item as produced by the AI, before it becomes a task row. */
export interface ExtractedActionItem {
  text: string;
  assignee: string;
  deadline: string;
  confidence: number;
}

/** A locked document is read-only until amend_minutes() reopens it. */
export function isLocked(m: Pick<Minutes, 'locked_at'>): boolean {
  return m.locked_at !== null;
}
