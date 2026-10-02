// Small formatting/util helpers — ported from the helpers in assets/js/shared.js.

export function fmtDate(d: string | number | Date | undefined | null, withTime = false): string {
  if (!d) return '';
  const date = new Date(d);
  const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  if (withTime) {
    opts.hour = 'numeric';
    opts.minute = '2-digit';
  }
  return date.toLocaleString('en-US', opts);
}

export function fmtTime(s: number | null | undefined): string {
  if (s == null) return '00:00';
  s = Math.floor(s);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function uid(prefix = 'id'): string {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

export function initials(name: string | undefined | null): string {
  return (
    (name || '')
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() || '')
      .join('') || 'U'
  );
}

/** Combine class names, dropping falsey values. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
