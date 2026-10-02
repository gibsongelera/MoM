/**
 * Builds the attendance roster for a meeting (client request: attendance is
 * produced automatically from the people on the meeting, then signed).
 *
 * Pure so it can be unit tested. The stored shape stays compatible with the
 * root app's attendance.records (userId/name/role/present/signatureDataUrl/
 * signedAt), adding `key`, `kind` and `affiliation`.
 */
import type { MeetingGuest, PanelMember } from '@/lib/types/domain';
import { normalizeName } from './people';

export type RosterKind = 'approver' | 'chair' | 'panel' | 'adviser' | 'participant' | 'guest' | 'walk_in';

export interface AttendanceRecord {
  /** `u:<userId>` for accounts, `g:<id>` for typed people. Stable across rebuilds. */
  key: string;
  userId?: string | null;
  name: string;
  role: string;
  kind: RosterKind;
  affiliation?: string | null;
  present: boolean;
  signatureDataUrl?: string;
  signedAt?: number | null;
}

export interface RosterPerson {
  id: string;
  name: string;
  role?: string | null;
  position?: string | null;
}

export interface RosterInput {
  approverId?: string | null;
  chairpersonName?: string | null;
  chairpersonId?: string | null;
  panel?: PanelMember[];
  adviserName?: string | null;
  adviserId?: string | null;
  /** Participants with accounts (meeting_participants joined to profiles). */
  participants: RosterPerson[];
  guests?: MeetingGuest[];
  /** Previously saved records: their present/signature state is kept. */
  existing?: AttendanceRecord[];
}

const KIND_LABEL: Record<RosterKind, string> = {
  approver: 'Department head',
  chair: 'Chairperson',
  panel: 'Panel member',
  adviser: 'Adviser',
  participant: 'Participant',
  guest: 'Guest',
  walk_in: 'Walk-in',
};

function slug(name: string): string {
  return normalizeName(name).toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, '-');
}

export function buildRoster(input: RosterInput): AttendanceRecord[] {
  const out: AttendanceRecord[] = [];
  const byUser = new Map<string, AttendanceRecord>();
  const byName = new Map<string, AttendanceRecord>();
  const people = new Map(input.participants.map((p) => [p.id, p]));
  const previous = new Map((input.existing ?? []).map((r) => [r.key, r]));

  function add(rec: Omit<AttendanceRecord, 'present'> & { present?: boolean }) {
    const name = normalizeName(rec.name);
    if (!name) return;
    const nameKey = name.toLocaleLowerCase('en');
    // One row per account, and one row per typed name.
    if (rec.userId && byUser.has(rec.userId)) return;
    if (!rec.userId && byName.has(nameKey)) return;
    const prior = previous.get(rec.key);
    const row: AttendanceRecord = {
      ...rec,
      name,
      present: prior?.present ?? rec.present ?? false,
      ...(prior?.signatureDataUrl ? { signatureDataUrl: prior.signatureDataUrl, signedAt: prior.signedAt ?? null } : {}),
    };
    out.push(row);
    if (row.userId) byUser.set(row.userId, row);
    byName.set(nameKey, row);
  }

  const account = (id: string, kind: RosterKind, fallbackName?: string | null) => {
    const p = people.get(id);
    add({
      key: `u:${id}`,
      userId: id,
      name: p?.name ?? fallbackName ?? '',
      role: kind === 'participant' ? p?.position || KIND_LABEL.participant : KIND_LABEL[kind],
      kind,
    });
  };
  const typed = (name: string | null | undefined, kind: RosterKind, affiliation?: string | null, id?: string) =>
    add({
      key: `g:${id ?? `${kind}-${slug(name ?? '')}`}`,
      userId: null,
      name: name ?? '',
      role: kind === 'guest' ? affiliation || KIND_LABEL.guest : KIND_LABEL[kind],
      kind,
      affiliation: affiliation ?? null,
    });

  if (input.approverId) account(input.approverId, 'approver');
  if (input.chairpersonId) account(input.chairpersonId, 'chair', input.chairpersonName);
  else if (input.chairpersonName) typed(input.chairpersonName, 'chair');
  for (const p of input.panel ?? []) {
    if (p.userId) account(p.userId, 'panel', p.name);
    else typed(p.name, 'panel', p.affiliation);
  }
  if (input.adviserId) account(input.adviserId, 'adviser', input.adviserName);
  else if (input.adviserName) typed(input.adviserName, 'adviser');
  for (const p of input.participants) account(p.id, 'participant');
  for (const g of input.guests ?? []) typed(g.name, 'guest', g.affiliation, g.id);
  for (const r of input.existing ?? []) {
    if (r.kind === 'walk_in') add(r);
  }
  return out;
}

/** A walk-in typed at the door. */
export function walkIn(name: string, affiliation?: string | null): AttendanceRecord {
  return {
    key: `g:walkin-${crypto.randomUUID()}`,
    userId: null,
    name: normalizeName(name),
    role: normalizeName(affiliation) || KIND_LABEL.walk_in,
    kind: 'walk_in',
    affiliation: normalizeName(affiliation) || null,
    present: true,
  };
}

/** Simple-majority quorum over the expected attendees (walk-ins excluded). */
export function quorum(records: AttendanceRecord[]) {
  const expected = records.filter((r) => r.kind !== 'walk_in');
  const present = records.filter((r) => r.present).length;
  const needed = expected.length ? Math.floor(expected.length / 2) + 1 : 0;
  return { present, total: records.length, needed, met: expected.length > 0 && expected.filter((r) => r.present).length >= needed };
}
