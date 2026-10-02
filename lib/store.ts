// SmartMin local data store — faithful TS port of assets/js/store.js.
// Client-side only (localStorage + IndexedDB). All reads/writes guard against
// SSR so the module is import-safe from server components; actual data access
// happens in the browser. Wrapping every access here keeps a future DB swap
// isolated to this one file.

import type {
  Attendance,
  AuditEntry,
  Minutes,
  Notification,
  Role,
  Settings,
  Taxonomy,
  Task,
  User,
  Meeting,
  PersonalMeeting,
} from './types';

export const LS_KEYS = {
  users: 'sm_users',
  departments: 'sm_departments',
  meetings: 'sm_meetings',
  tasks: 'sm_tasks',
  transcripts: 'sm_transcripts',
  minutes: 'sm_minutes',
  signatures: 'sm_signatures',
  audit: 'sm_audit',
  settings: 'sm_settings',
  notifications: 'sm_notifications',
  offlineQueue: 'sm_offline_queue',
  personalMeetings: 'sm_personal_meetings',
  taxonomy: 'sm_meeting_taxonomy',
  attendance: 'sm_attendance',
  currentUser: 'sm_currentUser',
  seeded: 'sm_seeded_v3',
} as const;

const hasWindow = () => typeof window !== 'undefined';

export function read<T>(key: string, fallback: T): T {
  if (!hasWindow()) return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function write<T>(key: string, value: T): boolean {
  if (!hasWindow()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// IndexedDB for binary audio storage
// ============================================================
const DB_NAME = 'SmartMinDB';
const DB_VER = 1;
let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('audio')) {
        db.createObjectStore('audio', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export interface AudioRecord {
  id: string;
  blob: Blob;
  meta: Record<string, unknown>;
  savedAt: number;
}

export async function saveAudio(id: string, blob: Blob, meta: Record<string, unknown> = {}) {
  const db = await openDB();
  return new Promise<string>((res, rej) => {
    const tx = db.transaction('audio', 'readwrite');
    tx.objectStore('audio').put({ id, blob, meta, savedAt: Date.now() });
    tx.oncomplete = () => res(id);
    tx.onerror = () => rej(tx.error);
  });
}

export async function getAudio(id: string): Promise<AudioRecord | null> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('audio', 'readonly');
    const req = tx.objectStore('audio').get(id);
    req.onsuccess = () => res((req.result as AudioRecord) || null);
    req.onerror = () => rej(req.error);
  });
}

export async function listAudio(): Promise<AudioRecord[]> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('audio', 'readonly');
    const req = tx.objectStore('audio').getAll();
    req.onsuccess = () => res((req.result as AudioRecord[]) || []);
    req.onerror = () => rej(req.error);
  });
}

export async function deleteAudio(id: string) {
  const db = await openDB();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction('audio', 'readwrite');
    tx.objectStore('audio').delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// ============================================================
// Generic CRUD helpers
// ============================================================
export interface Entity {
  id: string;
  createdAt?: number;
  updatedAt?: number;
}

export function listAll<T>(key: string): T[] {
  return read<T[]>(key, []);
}

export function getById<T extends Entity>(key: string, id: string): T | null {
  return read<T[]>(key, []).find((x) => x.id === id) || null;
}

export function upsert<T extends Entity>(key: string, item: T): T {
  const arr = read<T[]>(key, []);
  const idx = arr.findIndex((x) => x.id === item.id);
  if (idx >= 0) arr[idx] = { ...arr[idx], ...item, updatedAt: Date.now() };
  else arr.unshift({ ...item, createdAt: Date.now(), updatedAt: Date.now() });
  write(key, arr);
  return item;
}

export function remove(key: string, id: string) {
  const arr = read<Entity[]>(key, []).filter((x) => x.id !== id);
  write(key, arr);
}

// ============================================================
// Scope filters — admin sees everything, others see scoped data
// ============================================================
type Scoped = { role: Role; departmentId: string; id: string };

export function scopeMeetings(user: Scoped | null, meetings: Meeting[]): Meeting[] {
  if (!user) return [];
  if (user.role === 'admin') return meetings;
  if (user.role === 'head') return meetings.filter((m) => m.departmentId === user.departmentId);
  if (user.role === 'secretary')
    return meetings.filter((m) => m.departmentId === user.departmentId || m.secretaryId === user.id);
  if (user.role === 'faculty')
    return meetings.filter(
      (m) => (m.participantIds || []).includes(user.id) || m.departmentId === user.departmentId,
    );
  return [];
}

export function scopeTasks(user: Scoped | null, tasks: Task[]): Task[] {
  if (!user) return [];
  if (user.role === 'admin') return tasks;
  if (user.role === 'head') return tasks.filter((t) => t.departmentId === user.departmentId);
  if (user.role === 'secretary') return tasks.filter((t) => t.departmentId === user.departmentId);
  if (user.role === 'faculty') return tasks.filter((t) => t.assigneeId === user.id);
  return [];
}

export function scopeUsers(user: Scoped | null, users: User[]): User[] {
  if (!user) return [];
  if (user.role === 'admin') return users;
  if (user.role === 'head' || user.role === 'secretary')
    return users.filter((u) => u.departmentId === user.departmentId);
  return users.filter((u) => u.id === user.id);
}

export function scopePersonalMeetings(
  user: Scoped | null,
  items: PersonalMeeting[],
): PersonalMeeting[] {
  if (!user) return [];
  if (user.role === 'admin') return items;
  return items.filter((p) => p.userId === user.id);
}

// ============================================================
// Audit log
// ============================================================
export function audit(action: string, detail = '') {
  const user = read<User | null>(LS_KEYS.currentUser, null);
  const log = read<AuditEntry[]>(LS_KEYS.audit, []);
  log.unshift({
    id: 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
    ts: Date.now(),
    action,
    detail,
    userId: user?.id || 'anonymous',
    userName: user?.name || 'Anonymous',
    role: user?.role || 'guest',
  });
  if (log.length > 500) log.length = 500;
  write(LS_KEYS.audit, log);
}

// ============================================================
// Settings
// ============================================================
export function getSettings(): Settings {
  return read<Settings>(LS_KEYS.settings, {
    aiEnabled: true,
    autoTranscribe: true,
    autoSummarize: true,
    autoUploadOnReconnect: true,
    localProcessingOnly: false,
    retentionDays: 365,
    defaultLanguage: 'en-US',
    institutionName: 'Zamboanga Peninsula Polytechnic State University',
    institutionShort: 'ZPPSU',
  });
}

export function setSettings(s: Partial<Settings>) {
  write(LS_KEYS.settings, { ...getSettings(), ...s });
  audit('settings_changed', Object.keys(s).join(', '));
}

// ============================================================
// Notifications
// ============================================================
export function pushNotification(notif: Omit<Notification, 'id' | 'ts' | 'read'> & Partial<Notification>) {
  const arr = read<Notification[]>(LS_KEYS.notifications, []);
  arr.unshift({
    id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
    ts: Date.now(),
    read: false,
    ...notif,
  } as Notification);
  if (arr.length > 100) arr.length = 100;
  write(LS_KEYS.notifications, arr);
}

// ============================================================
// Locking / amendment helpers
// ============================================================
export function lockMinutes(minutesId: string, byUserId: string): Minutes | null {
  const arr = read<Minutes[]>(LS_KEYS.minutes, []);
  const i = arr.findIndex((m) => m.id === minutesId);
  if (i < 0) return null;
  arr[i] = { ...arr[i], lockedAt: Date.now(), lockedBy: byUserId, status: 'approved' };
  write(LS_KEYS.minutes, arr);
  return arr[i];
}

export function amendMinutes(minutesId: string, summary?: string): Minutes | null {
  const arr = read<Minutes[]>(LS_KEYS.minutes, []);
  const i = arr.findIndex((m) => m.id === minutesId);
  if (i < 0) return null;
  const me = read<User | null>(LS_KEYS.currentUser, null);
  const min = arr[i];
  const amendments = Array.isArray(min.amendments) ? min.amendments.slice() : [];
  amendments.push({
    ts: Date.now(),
    byUserId: me?.id || 'anonymous',
    byName: me?.name || 'Anonymous',
    summary: summary || 'Minutes amended after lock',
  });
  arr[i] = {
    ...min,
    signatures: (min.signatures || []).filter(
      (s) => s.role && !/dean|chair|head|president/i.test(s.role),
    ),
    lockedAt: null,
    lockedBy: null,
    status: 'pending_approval',
    amendments,
  };
  write(LS_KEYS.minutes, arr);

  const meetings = read<Meeting[]>(LS_KEYS.meetings, []);
  const mi = meetings.findIndex((m) => m.id === min.meetingId);
  if (mi >= 0) {
    meetings[mi] = { ...meetings[mi], status: 'pending_approval' };
    write(LS_KEYS.meetings, meetings);
  }
  return arr[i];
}

// ============================================================
// Meeting taxonomy
// ============================================================
export function getTaxonomy(): Taxonomy {
  return read<Taxonomy>(LS_KEYS.taxonomy, {
    capstone: ['Title Proposal', 'Pre-Oral', 'Mock Defense', 'Final Presentation', 'Other'],
    research: ['Proposal', 'Progress', 'Final'],
  });
}

export function setTaxonomy(tx: Taxonomy) {
  write(LS_KEYS.taxonomy, tx);
  audit('taxonomy_updated', Object.keys(tx).join(', '));
}

// ============================================================
// Attendance (Phase 3)
// ============================================================
export function getAttendanceForMeeting(meetingId: string): Attendance | null {
  return read<Attendance[]>(LS_KEYS.attendance, []).find((a) => a.meetingId === meetingId) || null;
}

export function saveAttendance(att: Attendance) {
  return upsert<Attendance>(LS_KEYS.attendance, att);
}

// ============================================================
// Stats helpers
// ============================================================
export function statsFor(user: Scoped | null) {
  const m = scopeMeetings(user, listAll<Meeting>(LS_KEYS.meetings));
  const t = scopeTasks(user, listAll<Task>(LS_KEYS.tasks));
  const u = scopeUsers(user, listAll<User>(LS_KEYS.users));
  const now = new Date();
  const thisMonth = m.filter((x) => {
    const d = new Date(x.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  return {
    totalUsers: u.length,
    activeUsers: u.filter((x) => x.active !== false).length,
    totalMeetings: m.length,
    meetingsThisMonth: thisMonth.length,
    pendingApprovals: m.filter((x) => x.status === 'pending_approval').length,
    pendingTasks: t.filter((x) => x.status === 'pending').length,
    tasksInProgress: t.filter((x) => x.status === 'in_progress').length,
    tasksDone: t.filter((x) => x.status === 'done').length,
    aiHoursSaved:
      Math.round(
        m.filter((x) => x.aiProcessed).reduce((s, x) => s + ((x.durationMin || 30) * 0.8) / 60, 0) *
          10,
      ) / 10,
  };
}
