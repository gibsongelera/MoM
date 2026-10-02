/** Parses a `?month=YYYY-MM` search param into { year, month } (0-indexed
 * month), defaulting to the current month. Shared by all 3 role calendar
 * pages so the `?month=` contract stays identical across them. */
export function parseMonthParam(raw: string | undefined): { year: number; month: number } {
  const now = new Date();
  if (!raw) return { year: now.getFullYear(), month: now.getMonth() };
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match) return { year: now.getFullYear(), month: now.getMonth() };
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return { year: now.getFullYear(), month: now.getMonth() };
  return { year, month };
}
