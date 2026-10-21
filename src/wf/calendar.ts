// Working calendar and SLA timers (Part 16 REQ-WF-F08; A-155). A due time counts working days only. Until the owner supplies the holidays
// (Part 05 calendar, §2.7) the calendar is Monday to Friday with no holidays, and that is stated wherever it is used.
export interface WorkingCalendar {
  /** Days of the week that do not count: 0 is Sunday. */
  weekend: number[];
  /** Holidays as YYYY-MM-DD. */
  holidays: string[];
}

export const DEFAULT_CALENDAR: WorkingCalendar = { weekend: [0, 6], holidays: [] };

function isWorking(d: Date, cal: WorkingCalendar): boolean {
  const iso = d.toISOString().slice(0, 10);
  return !cal.weekend.includes(d.getUTCDay()) && !cal.holidays.includes(iso);
}

/** The instant that is the given number of working days after the start, at the same time of day. */
export function addWorkingDays(start: Date, days: number, cal: WorkingCalendar = DEFAULT_CALENDAR): Date {
  if (!Number.isInteger(days) || days < 0) throw new RangeError("the working days must be a whole number of zero or more");
  const d = new Date(start.getTime());
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorking(d, cal)) left--;
  }
  return d;
}

export type SlaState = "running" | "reminder_50" | "reminder_90" | "expired";

/** How far through its window a task is, in elapsed time from creation to due time. */
export function slaState(createdAt: Date, dueAt: Date, now: Date): SlaState {
  const window = dueAt.getTime() - createdAt.getTime();
  if (window <= 0) return "expired";
  const fraction = (now.getTime() - createdAt.getTime()) / window;
  if (fraction >= 1) return "expired";
  if (fraction >= 0.9) return "reminder_90";
  if (fraction >= 0.5) return "reminder_50";
  return "running";
}
