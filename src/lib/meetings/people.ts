/**
 * Pure helpers for the typed people on a meeting (guests, chairperson, panel).
 * Mirrors the database checks in 0016 (non-empty, <= 120 chars, caps) so the
 * form explains problems before the server rejects them.
 */
import type { MeetingGuest, PanelMember } from '@/lib/types/domain';

export const NAME_MAX = 120;
export const MAX_GUESTS = 100;
export const MAX_PANEL = 6;
export const DEFAULT_PANEL_ROWS = 2;

/** Trims and collapses internal whitespace. */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? '').replace(/\s+/g, ' ').trim();
}

function key(name: string): string {
  return normalizeName(name).toLocaleLowerCase('en');
}

/** Drops blank rows, normalizes names and affiliations, removes duplicate names. */
export function cleanGuests(rows: MeetingGuest[]): MeetingGuest[] {
  const seen = new Set<string>();
  const out: MeetingGuest[] = [];
  for (const row of rows) {
    const name = normalizeName(row.name);
    if (!name || seen.has(key(name))) continue;
    seen.add(key(name));
    const affiliation = normalizeName(row.affiliation) || null;
    out.push({ id: row.id, name, ...(affiliation ? { affiliation } : {}) });
  }
  return out;
}

/** Same for panel members; a linked account wins over a duplicate typed name. */
export function cleanPanel(rows: PanelMember[]): PanelMember[] {
  const byKey = new Map<string, PanelMember>();
  for (const row of rows) {
    const name = normalizeName(row.name);
    if (!name) continue;
    const affiliation = normalizeName(row.affiliation) || null;
    const next: PanelMember = { name, ...(row.userId ? { userId: row.userId } : {}), ...(affiliation ? { affiliation } : {}) };
    const existing = byKey.get(key(name));
    if (!existing || (!existing.userId && next.userId)) byKey.set(key(name), next);
  }
  return [...byKey.values()];
}

export interface PeopleProblems {
  guests?: string;
  panel?: string;
  chairperson?: string;
}

/** Validation messages written for the person filling in the form. */
export function validatePeople(input: {
  guests: MeetingGuest[];
  panel: PanelMember[];
  chairpersonName: string;
  isCapstone: boolean;
}): PeopleProblems {
  const problems: PeopleProblems = {};
  if (input.guests.some((g) => normalizeName(g.name).length > NAME_MAX)) {
    problems.guests = `Names can be up to ${NAME_MAX} characters.`;
  } else if (cleanGuests(input.guests).length > MAX_GUESTS) {
    problems.guests = `You can add up to ${MAX_GUESTS} people without accounts.`;
  }
  if (input.isCapstone) {
    if (input.panel.some((p) => normalizeName(p.name).length > NAME_MAX)) {
      problems.panel = `Names can be up to ${NAME_MAX} characters.`;
    } else if (cleanPanel(input.panel).length > MAX_PANEL) {
      problems.panel = `A panel can have up to ${MAX_PANEL} members.`;
    }
    if (normalizeName(input.chairpersonName).length > NAME_MAX) {
      problems.chairperson = `Names can be up to ${NAME_MAX} characters.`;
    }
  }
  return problems;
}
