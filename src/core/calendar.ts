// Enterprise calendar rules (Part 05 REQ-CORE-F10). Pure functions over dates in the company's business calendar.
// Dates are ISO strings (YYYY-MM-DD) so that no time zone shifts a business date (AC-7).

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

/** Financial year code for a date. The year starts in `startMonth` (default April, 4). Example: 2026-05-02 → "2026-27". */
export function financialYear(iso: string, startMonth = 4): string {
  const [y, m] = iso.split("-").map(Number);
  const start = m >= startMonth ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Period number 1–12 within the financial year. Period 1 is `startMonth`. */
export function periodNumber(iso: string, startMonth = 4): number {
  const m = Number(iso.slice(5, 7));
  return ((m - startMonth + 12) % 12) + 1;
}

export interface WorkingCalendar {
  /** Working weekdays: 0 = Sunday … 6 = Saturday. Default Monday to Saturday. */
  workingWeekdays: number[];
  holidays: Set<string>;
  /** Non-working days added by exceptions (rain, curfew, strike). */
  exceptionsNonWorking: Set<string>;
}

export function isWorkingDay(iso: string, cal: WorkingCalendar): boolean {
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
  if (!cal.workingWeekdays.includes(weekday)) return false;
  return !cal.holidays.has(iso) && !cal.exceptionsNonWorking.has(iso);
}

/** Working days from `from` (exclusive) to `to` (inclusive). Negative when `to` is before `from`. */
export function workingDaysBetween(from: string, to: string, cal: WorkingCalendar): number {
  if (to === from) return 0;
  const sign = to > from ? 1 : -1;
  let count = 0;
  let cursor = from;
  while (cursor !== to) {
    cursor = addDays(cursor, sign);
    if (isWorkingDay(cursor, cal)) count += sign;
  }
  return count;
}

/** Effective-dated holiday rule: a holiday declared with valid_from applies only to dates on or after that day. */
export function holidaysEffectiveOn(declarations: { date: string; validFrom: string }[], onDate: string): Set<string> {
  return new Set(declarations.filter((d) => d.validFrom <= onDate).map((d) => d.date));
}
