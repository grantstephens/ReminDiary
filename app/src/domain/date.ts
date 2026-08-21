/**
 * Calendar dates and the timestamp format the CSV wire form uses.
 *
 * This module is pure TypeScript on purpose: it imports nothing, so it can be
 * tested in a plain Node environment and reasoned about without a simulator.
 */

/**
 * A calendar date in ISO-8601 form, "YYYY-MM-DD", always zero-padded.
 *
 * A JournalDate is a calendar date, not an instant: it has no time and no zone.
 * Build one only through parseDate, today, or addDays, so that "a JournalDate is
 * always a real, correctly padded date" holds everywhere. Because the form is
 * zero-padded and fixed-width, lexicographic ordering is chronological ordering
 * — which is what lets both SQL string ordering and IndexedDB key ranges walk
 * the diary in date order with no secondary index.
 */
export type JournalDate = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** RFC3339 as Go writes and accepts it: a mandatory T and a mandatory offset. */
const RFC3339_RE =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function isoFromUtc(t: Date): string {
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** parseDate validates s and returns it as a JournalDate, or throws. */
export function parseDate(s: string): JournalDate {
  const parsed = tryParseDate(s);
  if (parsed === null) {
    throw new Error(`invalid date "${s}": want YYYY-MM-DD`);
  }
  return parsed;
}

/** tryParseDate is parseDate without the throw, for callers that expect misses. */
export function tryParseDate(s: string): JournalDate | null {
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  const t = new Date(0);
  // setUTCFullYear rather than Date.UTC, which maps years 0-99 into the 1900s.
  t.setUTCFullYear(year, month - 1, day);
  t.setUTCHours(0, 0, 0, 0);

  // Round-tripping rejects anything the constructor silently rolled over,
  // such as 2026-02-30 becoming 2026-03-02.
  return isoFromUtc(t) === s ? s : null;
}

/**
 * today returns the calendar date of now in now's own local zone.
 *
 * This is the one place local calendar fields are read. The diary should agree
 * with the wall clock in the room, not with UTC. Every operation on the
 * resulting date is then done in UTC.
 */
export function today(now: Date): JournalDate {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * toUtcTime returns the date as midnight UTC. It is the basis for all date
 * arithmetic: doing the arithmetic in UTC means a local DST transition can
 * never add or drop a day.
 */
export function toUtcTime(d: JournalDate): Date {
  const m = DATE_RE.exec(d);
  if (!m) {
    // Unreachable for dates built through the constructors, which is the only
    // supported way to make one.
    throw new Error(`invalid date "${d}": want YYYY-MM-DD`);
  }
  const t = new Date(0);
  t.setUTCFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  t.setUTCHours(0, 0, 0, 0);
  return t;
}

/** addDays returns the date days later, accepting negatives to go backwards. */
export function addDays(d: JournalDate, days: number): JournalDate {
  const t = toUtcTime(d);
  t.setUTCDate(t.getUTCDate() + days);
  return isoFromUtc(t);
}

export function yearOf(d: JournalDate): number {
  return toUtcTime(d).getUTCFullYear();
}

/** monthOf returns the 1-based calendar month, matching SQL and human speech. */
export function monthOf(d: JournalDate): number {
  return toUtcTime(d).getUTCMonth() + 1;
}

export function dayOf(d: JournalDate): number {
  return toUtcTime(d).getUTCDate();
}

/**
 * displayDate renders the human-facing form, for example "Wed 19 Aug 2026".
 *
 * Hand-rolled rather than Intl: en-GB renders "Wed, 19 Aug 2026" with a comma,
 * where the Go app's "Mon 2 Jan 2006" layout has none, and Hermes on Android
 * ships a variable ICU footprint. Fixed arrays are identical everywhere.
 */
export function displayDate(d: JournalDate): string {
  const t = toUtcTime(d);
  return `${WEEKDAYS[t.getUTCDay()]} ${t.getUTCDate()} ${MONTHS_SHORT[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
}

/** displayDayMonth renders "19 August", matching Go's "2 January" layout. */
export function displayDayMonth(d: JournalDate): string {
  const t = toUtcTime(d);
  return `${t.getUTCDate()} ${MONTHS_LONG[t.getUTCMonth()]}`;
}

/**
 * toRfc3339Utc renders an instant the way Go's time.RFC3339 does: UTC, and
 * with no fractional seconds, which Go's layout never prints. CSV byte
 * identity with the Go app depends on both halves of that.
 */
export function toRfc3339Utc(t: Date): string {
  return t.toISOString().replace(/\.\d+Z$/, 'Z');
}

/**
 * parseRfc3339 validates a wire timestamp and returns it in canonical UTC form,
 * or null. JavaScript's Date constructor is far more permissive than Go's
 * time.Parse — it will happily accept a bare "2026-08-19" — so the shape is
 * checked with a regex before the value is.
 */
export function parseRfc3339(s: string): string | null {
  if (!RFC3339_RE.test(s)) return null;
  const t = new Date(s);
  if (Number.isNaN(t.getTime())) return null;
  return toRfc3339Utc(t);
}
