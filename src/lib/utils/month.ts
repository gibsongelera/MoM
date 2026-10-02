import { currentManilaMonth } from './datetime';

/** Parses a `?month=YYYY-MM` search param into { year, month } (0-indexed
 * month), defaulting to the current Manila month. Shared by all 3 role calendar
 * pages so the `?month=` contract stays identical across them. */
export function parseMonthParam(raw: string | undefined): { year: number; month: number } {
  const fallback = currentManilaMonth();
  if (!raw) return fallback;
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match) return fallback;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return fallback;
  return { year, month };
}
