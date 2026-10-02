/**
 * Date/time helpers pinned to Asia/Manila.
 *
 * The app serves one Philippine university, but server components may run on a
 * UTC host and browsers may be set to any zone. Every user-facing date goes
 * through here so a 9:00 AM meeting never shows as 1:00 AM or on the wrong day.
 */
export const MANILA_TZ = 'Asia/Manila';
const MANILA_OFFSET = '+08:00'; // The Philippines has no daylight saving time.

function partsOf(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** ISO timestamp -> value for an <input type="datetime-local">, in Manila time. */
export function toManilaInput(iso: string | Date): string {
  const p = partsOf(typeof iso === 'string' ? new Date(iso) : iso);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** <input type="datetime-local"> value (Manila wall time) -> ISO timestamp. */
export function fromManilaInput(local: string): string {
  const withSeconds = local.length === 16 ? `${local}:00` : local;
  return new Date(`${withSeconds}${MANILA_OFFSET}`).toISOString();
}

/** "YYYY-MM-DD" of the Manila calendar day containing `date`. */
export function manilaDateKey(date: string | Date): string {
  const p = partsOf(typeof date === 'string' ? new Date(date) : date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Start of today in Manila, as a Date. */
export function startOfManilaDay(now: Date = new Date()): Date {
  return new Date(`${manilaDateKey(now)}T00:00:00${MANILA_OFFSET}`);
}

/** "Oct 8, 2026, 2:00 PM" in Manila time. */
export function fmtManila(iso: string | Date, options?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: MANILA_TZ,
    ...(options ?? { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
  });
}

/** "Oct 8, 2026" in Manila time. */
export function fmtManilaDate(iso: string | Date): string {
  return fmtManila(iso, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** "2:00 PM" in Manila time. */
export function fmtManilaTime(iso: string | Date): string {
  return fmtManila(iso, { hour: 'numeric', minute: '2-digit' });
}
