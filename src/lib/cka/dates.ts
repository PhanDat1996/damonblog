// Calendar dates for the tracker.
//
// All dates are plain local calendar days as 'YYYY-MM-DD' strings. They are
// produced from the browser's local timezone and compared as calendar days,
// so a session at 23:30 counts for that day wherever the user is.
//
// Week boundary: weeks run Monday 00:00 to Sunday 23:59 local time
// (ISO 8601 week).

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1970 || y > 9999) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Local calendar date of `now` as YYYY-MM-DD. */
export function toLocalIsoDate(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toUtcDays(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

function fromUtcDays(days: number): string {
  return new Date(days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return toUtcDays(to) - toUtcDays(from);
}

export function addDays(iso: string, days: number): string {
  return fromUtcDays(toUtcDays(iso) + days);
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const days = toUtcDays(iso);
  // 1970-01-01 was a Thursday. Shift so Monday = 0.
  const dow = (((days + 3) % 7) + 7) % 7;
  return fromUtcDays(days - dow);
}

/** Sunday of the week containing `iso`. */
export function weekEnd(iso: string): string {
  return addDays(weekStart(iso), 6);
}

export function isInWeekOf(date: string, reference: string): boolean {
  return date >= weekStart(reference) && date <= weekEnd(reference);
}

/** e.g. "Tue, Oct 28, 2026". Formats the calendar day without timezone shifts. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
