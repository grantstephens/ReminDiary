import {
  addDays,
  dayOf,
  displayDate,
  displayDayMonth,
  monthOf,
  parseDate,
  parseRfc3339,
  toRfc3339Utc,
  today,
  tryParseDate,
  yearOf,
} from './date';

describe('parseDate', () => {
  test.each([
    '2026-08-19',
    '2024-02-29', // a real leap day
    '2000-01-01',
    '9999-12-31',
  ])('accepts %s', (s) => {
    expect(parseDate(s)).toBe(s);
  });

  test.each([
    ['2026-8-9', 'unpadded'],
    ['26-08-19', 'two-digit year'],
    ['2026-08-19T00:00:00Z', 'a timestamp, not a date'],
    ['2026-02-30', 'a day that does not exist'],
    ['2023-02-29', 'a leap day in a non-leap year'],
    ['2026-13-01', 'a month that does not exist'],
    ['2026-00-10', 'month zero'],
    ['2026-08-00', 'day zero'],
    ['', 'empty'],
    ['not a date', 'nonsense'],
  ])('rejects %s (%s)', (s) => {
    expect(() => parseDate(s)).toThrow(/want YYYY-MM-DD/);
    expect(tryParseDate(s)).toBeNull();
  });
});

describe('addDays', () => {
  test.each([
    ['2026-08-19', 1, '2026-08-20'],
    ['2026-08-19', -1, '2026-08-18'],
    ['2026-08-31', 1, '2026-09-01'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2024-02-28', 1, '2024-02-29'], // leap year
    ['2023-02-28', 1, '2023-03-01'], // non-leap year
    ['2024-02-29', 1, '2024-03-01'],
    ['2026-08-19', 0, '2026-08-19'],
    ['2026-08-19', 365, '2027-08-19'],
  ])('%s + %i = %s', (from, days, want) => {
    expect(addDays(parseDate(from), days)).toBe(want);
  });

  // The whole reason arithmetic is done in UTC. This suite runs pinned to
  // Pacific/Auckland (see jest.config.js), so these are the days New Zealand's
  // clocks actually move in 2026 - in local time one of them drops a day and
  // the other repeats one.
  test('is immune to a local DST transition', () => {
    expect(addDays(parseDate('2026-04-04'), 1)).toBe('2026-04-05'); // clocks back
    expect(addDays(parseDate('2026-04-05'), 1)).toBe('2026-04-06');
    expect(addDays(parseDate('2026-09-26'), 1)).toBe('2026-09-27'); // clocks forward
    expect(addDays(parseDate('2026-09-27'), 1)).toBe('2026-09-28');
  });
});

describe('today', () => {
  // today() reads LOCAL calendar fields, unlike every other date operation:
  // the diary should agree with the wall clock in the room. This suite is
  // pinned to Pacific/Auckland (UTC+12), so an instant late in the UTC day has
  // already rolled over locally - which is exactly what must be observed.
  test('is the local calendar date, not the UTC one', () => {
    expect(today(new Date('2026-08-19T23:30:00Z'))).toBe('2026-08-20');
    expect(today(new Date('2026-08-19T11:30:00Z'))).toBe('2026-08-19');
  });

  test('zero-pads', () => {
    expect(today(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05');
  });
});

describe('field accessors', () => {
  test('read the calendar fields', () => {
    const d = parseDate('2026-08-19');
    expect(yearOf(d)).toBe(2026);
    expect(monthOf(d)).toBe(8); // 1-based, like a human and like SQL
    expect(dayOf(d)).toBe(19);
  });
});

describe('display', () => {
  // Must match Go's "Mon 2 Jan 2006" and "2 January" layouts exactly.
  test.each([
    ['2026-08-19', 'Wed 19 Aug 2026', '19 August'],
    ['2026-01-05', 'Mon 5 Jan 2026', '5 January'],
    ['2024-02-29', 'Thu 29 Feb 2024', '29 February'],
    ['2026-12-25', 'Fri 25 Dec 2026', '25 December'],
  ])('%s renders as %s / %s', (iso, long, dayMonth) => {
    const d = parseDate(iso);
    expect(displayDate(d)).toBe(long);
    expect(displayDayMonth(d)).toBe(dayMonth);
  });

  // Pinned to Pacific/Auckland, twelve hours off UTC: if display read local
  // fields instead of UTC ones, these would come back a day out.
  test('does not depend on the local zone', () => {
    expect(displayDate(parseDate('2026-08-19'))).toBe('Wed 19 Aug 2026');
    expect(displayDayMonth(parseDate('2026-01-01'))).toBe('1 January');
  });
});

describe('RFC3339', () => {
  test('drops fractional seconds, the way Go does', () => {
    expect(toRfc3339Utc(new Date('2026-08-19T18:42:00.123Z'))).toBe('2026-08-19T18:42:00Z');
    expect(toRfc3339Utc(new Date('2026-08-19T18:42:00Z'))).toBe('2026-08-19T18:42:00Z');
  });

  test.each([
    ['2026-08-19T18:42:00Z', '2026-08-19T18:42:00Z'],
    ['2026-08-19T18:42:00.500Z', '2026-08-19T18:42:00Z'],
    ['2026-08-19T19:42:00+01:00', '2026-08-19T18:42:00Z'], // normalised to UTC
    ['2026-08-19t18:42:00z', '2026-08-19T18:42:00Z'], // RFC3339 allows lowercase
  ])('parses %s as %s', (raw, want) => {
    expect(parseRfc3339(raw)).toBe(want);
  });

  test.each([
    '2026-08-19', // a date is not a timestamp
    '2026-08-19 18:42:00Z', // space instead of T
    '2026-08-19T18:42:00', // no offset
    '18:42:00Z',
    'yesterday',
    '',
  ])('rejects %s', (raw) => {
    expect(parseRfc3339(raw)).toBeNull();
  });
});
