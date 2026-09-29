// Calendar dates. Day indices are relative to the dataset's as-of date and
// every date is computed in UTC so the calendar never shifts with the viewer's zone.

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dateOf(asOf: string, day: number): Date {
  return new Date(Date.parse(`${asOf}T00:00:00Z`) + day * DAY_MS);
}

/** "12 Oct" */
export function shortDate(asOf: string, day: number): string {
  const d = dateOf(asOf, day);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Mon 12 Oct 2026" */
export function longDate(asOf: string, day: number): string {
  const d = dateOf(asOf, day);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "12–14 Oct", or "30 Oct–1 Nov" across a month boundary. */
export function dateRange(asOf: string, from: number, to: number): string {
  if (from === to) return shortDate(asOf, from);
  const a = dateOf(asOf, from);
  const b = dateOf(asOf, to);
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
  }
  return `${shortDate(asOf, from)}–${shortDate(asOf, to)}`;
}

export interface DayInfo {
  day: number;
  dayOfMonth: number;
  month: string;
  year: number;
  monday: boolean;
  firstOfMonth: boolean;
  isoWeek: number;
}

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
}

export function dayInfo(asOf: string, day: number): DayInfo {
  const d = dateOf(asOf, day);
  return {
    day,
    dayOfMonth: d.getUTCDate(),
    month: MONTHS[d.getUTCMonth()]!,
    year: d.getUTCFullYear(),
    monday: d.getUTCDay() === 1,
    firstOfMonth: d.getUTCDate() === 1,
    isoWeek: isoWeek(d),
  };
}

/** "1 Apr 2027" */
export function dateWithYear(asOf: string, day: number): string {
  const d = dateOf(asOf, day);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
