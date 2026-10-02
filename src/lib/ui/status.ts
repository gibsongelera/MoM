/**
 * Single source of truth for how statuses and meeting types are labelled and
 * coloured. Replaces four page-local `pillClassFor` copies whose mappings
 * disagreed (archived was red on one page; pending approval grey on another).
 */
import type { MeetingStatus, MeetingType, MinutesStatus } from '@/lib/types/domain';

export interface PillSpec {
  label: string;
  /** A `.pill-*` class from globals.css. */
  pill: string;
}

export const MEETING_STATUS: Record<MeetingStatus, PillSpec> = {
  scheduled: { label: 'Scheduled', pill: 'pill-pending' },
  recording: { label: 'Recording', pill: 'pill-progress' },
  transcribed: { label: 'Transcribed', pill: 'pill-progress' },
  pending_approval: { label: 'Awaiting approval', pill: 'pill-progress' },
  approved: { label: 'Approved', pill: 'pill-done' },
  archived: { label: 'Archived', pill: 'pill-regular' },
};

export const MINUTES_STATUS: Record<MinutesStatus, PillSpec> = {
  draft: { label: 'Draft', pill: 'pill-pending' },
  pending_approval: { label: 'Awaiting approval', pill: 'pill-progress' },
  approved: { label: 'Approved', pill: 'pill-done' },
};

export const MEETING_TYPE: Record<MeetingType, PillSpec & { icon: string }> = {
  regular: { label: 'Regular', pill: 'pill-regular', icon: 'groups' },
  capstone: { label: 'Capstone', pill: 'pill-capstone', icon: 'school' },
  research: { label: 'Research', pill: 'pill-research', icon: 'science' },
};

export const EMERGENCY_PILL: PillSpec = { label: 'Emergency', pill: 'pill-emergency' };

/** Tolerant lookup for values read from the database. */
export function meetingStatus(status: string | null | undefined): PillSpec {
  return MEETING_STATUS[status as MeetingStatus] ?? { label: humanize(status), pill: 'pill-pending' };
}

export function meetingType(type: string | null | undefined): PillSpec & { icon: string } {
  return MEETING_TYPE[type as MeetingType] ?? MEETING_TYPE.regular;
}

/** "pending_approval" -> "Pending approval" (every underscore, not just the first). */
export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
