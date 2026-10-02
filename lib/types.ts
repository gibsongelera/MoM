// Central entity types — ported from the shapes in assets/js/seed.js + store.js.
// Kept intentionally close to the original so the data layer is a faithful port.

export type Role = 'admin' | 'head' | 'secretary' | 'faculty';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: Role;
  departmentId: string;
  position?: string;
  active?: boolean;
  joinedAt?: string;
  /** Display URL for the avatar (signed Storage URL, or a local data URL while editing). */
  photoDataUrl?: string;
  /** Object path in the `avatars` Storage bucket (source of truth). */
  photoPath?: string;
  createdAt?: number;
  updatedAt?: number;
}

export type DepartmentType = 'college' | 'office' | 'department';

export interface Department {
  id: string;
  name: string;
  short: string;
  type: DepartmentType;
  headId?: string;
  officeLocation?: string;
  createdAt?: number;
  updatedAt?: number;
}

export type MeetingType = 'regular' | 'capstone' | 'research';
export type MeetingStatus =
  | 'scheduled'
  | 'transcribed'
  | 'pending_approval'
  | 'approved'
  | 'archived';

export type RsvpStatus = 'invited' | 'accepted' | 'declined';
export interface Participant {
  userId: string;
  status: RsvpStatus;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  durationMin?: number;
  venue?: string;
  departmentId: string;
  chairId?: string;
  secretaryId?: string;
  participantIds?: string[];
  agenda?: string[];
  status: MeetingStatus;
  aiProcessed?: boolean;
  language?: string;
  transcriptId?: string;
  minutesId?: string;
  meetingType?: MeetingType;
  subType?: string;
  projectTitle?: string;
  chairpersonId?: string;
  panelMemberIds?: string[];
  adviserId?: string;
  /** Phase 5 — RSVP/invitation flow (optional; falls back to participantIds). */
  participants?: Participant[];
  /** Phase 5 — lightweight RSVP map keyed by userId. */
  rsvps?: Record<string, RsvpStatus>;
  createdAt?: number;
  updatedAt?: number;
}

export interface TranscriptSegment {
  speakerId?: string;
  speaker: string;
  t: number;
  text: string;
  confidence?: number;
  /** Auto-detected language of this segment ('en' | 'tl'), when auto mode is on. */
  lang?: 'en' | 'tl';
}

/** A stored audio recording (Supabase Storage `meeting-audio` bucket). */
export interface AudioRecording {
  id: string;
  meetingId: string;
  storagePath: string;
  durationSec: number;
  language?: string;
  createdAt?: number;
  /** Resolved short-lived signed URL for playback (set by the DataProvider). */
  url?: string;
}

export interface Comment {
  id: string;
  ts: number;
  userId: string;
  name: string;
  text: string;
  parentId?: string;
}

export interface Transcript {
  id: string;
  meetingId: string;
  language?: string;
  segments: TranscriptSegment[];
  summary?: string;
  translatedTo?: string | null;
  confidence?: number;
  comments?: Comment[];
  /** Phase 2 — AI analysis output. */
  keyDecisions?: string[];
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

/** A motion put to the floor with a roll-call tally (rec #8). */
export interface Motion {
  id: string;
  text: string;
  movedBy?: string;
  secondedBy?: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  result: 'carried' | 'failed' | 'tabled' | 'pending';
  ts: number;
}

/** A point-in-time snapshot of the minutes (rec #13 — versioning/diff/restore). */
export interface MinutesVersion {
  ts: number;
  byUserId: string;
  byName: string;
  label: string;
  snapshot: {
    documentTitle?: string;
    callToOrder?: string;
    previousMinutes?: string;
    agendaItems?: AgendaItem[];
    adjournment?: string;
    status?: string;
  };
}

/** Phase 4 — a handwritten note read from an uploaded image. */
export interface PaperNote {
  id: string;
  pageOrPanel: string;
  note: string;
  source?: string;
  addedAt?: number;
}

export interface Minutes {
  id: string;
  meetingId: string;
  status: string;
  documentTitle?: string;
  callToOrder?: string;
  previousMinutes?: string;
  agendaItems?: AgendaItem[];
  actionItems?: string[];
  adjournment?: string;
  signatures?: Signature[];
  comments?: Comment[];
  amendments?: Amendment[];
  lockedAt?: number | null;
  lockedBy?: string | null;
  /** Phase 4 — handwritten panel notes, kept separate from audio-derived content. */
  paperNotes?: PaperNote[];
  /** Phase 5 — current display language of the document body. */
  translatedTo?: string | null;
  /** Motions + roll-call tallies (rec #8). */
  motions?: Motion[];
  /** Version snapshot history (rec #13). */
  versions?: MinutesVersion[];
  createdAt?: number;
  updatedAt?: number;
}

export type TaskStatus = 'pending' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  description?: string;
  meetingId?: string;
  departmentId?: string;
  assigneeId?: string;
  delegatedBy?: string;
  priority?: TaskPriority;
  deadline?: string;
  status: TaskStatus;
  aiExtracted?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface PersonalMeeting {
  id: string;
  userId: string;
  date: string;
  time: string;
  type: string;
  title: string;
  attendees: string;
  notes: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface AuditEntry {
  id: string;
  ts: number;
  action: string;
  detail: string;
  userId: string;
  userName: string;
  role: string;
}

export interface Notification {
  id: string;
  ts: number;
  read: boolean;
  type: string;
  title: string;
  body: string;
  userId: string;
}

export interface Settings {
  aiEnabled: boolean;
  autoTranscribe: boolean;
  autoSummarize: boolean;
  autoUploadOnReconnect: boolean;
  localProcessingOnly: boolean;
  retentionDays: number;
  defaultLanguage: string;
  institutionName: string;
  institutionShort: string;
}

export interface Taxonomy {
  capstone: string[];
  research: string[];
}

/** Phase 3 — attendance capture. */
export interface AttendanceRecord {
  userId: string;
  name: string;
  role: string;
  department?: string;
  present: boolean;
  signatureDataUrl?: string;
  signedAt?: number | null;
}

export interface Attendance {
  id: string;
  meetingId: string;
  startedAt: number;
  records: AttendanceRecord[];
  createdAt?: number;
  updatedAt?: number;
}
