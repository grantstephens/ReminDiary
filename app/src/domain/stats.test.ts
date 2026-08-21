import { parseDate } from './date';
import { computeStats } from './stats';

const d = (s: string) => parseDate(s);

describe('computeStats', () => {
  test('an empty diary has nothing to report', () => {
    expect(computeStats([], d('2026-08-19'))).toEqual({
      current: 0,
      longest: 0,
      total: 0,
      since: null,
    });
  });

  test('counts a single entry', () => {
    expect(computeStats([d('2026-08-19')], d('2026-08-19'))).toEqual({
      current: 1,
      longest: 1,
      total: 1,
      since: '2026-08-19',
    });
  });

  test('does not care what order the dates arrive in', () => {
    const shuffled = [d('2026-08-19'), d('2026-08-17'), d('2026-08-18')];
    expect(computeStats(shuffled, d('2026-08-19'))).toEqual({
      current: 3,
      longest: 3,
      total: 3,
      since: '2026-08-17',
    });
  });

  // The grace rule: an unwritten TODAY does not end the streak, an unwritten
  // YESTERDAY does. Writing at 00:05 should not feel like a punishment.
  test('an unwritten today does not end the streak', () => {
    const dates = [d('2026-08-17'), d('2026-08-18')];
    expect(computeStats(dates, d('2026-08-19')).current).toBe(2);
  });

  test('an unwritten yesterday does end the streak', () => {
    const dates = [d('2026-08-16'), d('2026-08-17')];
    expect(computeStats(dates, d('2026-08-19')).current).toBe(0);
  });

  test('finds the longest run even when it is not the current one', () => {
    const dates = [
      d('2026-01-01'), d('2026-01-02'), d('2026-01-03'), d('2026-01-04'),
      d('2026-08-18'), d('2026-08-19'),
    ];
    expect(computeStats(dates, d('2026-08-19'))).toEqual({
      current: 2,
      longest: 4,
      total: 6,
      since: '2026-01-01',
    });
  });

  test('runs across a month and a year boundary', () => {
    const dates = [d('2025-12-30'), d('2025-12-31'), d('2026-01-01'), d('2026-01-02')];
    expect(computeStats(dates, d('2026-01-02')).longest).toBe(4);
  });

  test('runs across a leap day', () => {
    const dates = [d('2024-02-28'), d('2024-02-29'), d('2024-03-01')];
    expect(computeStats(dates, d('2024-03-01')).longest).toBe(3);
  });

  test('duplicate dates are not double-counted in a streak', () => {
    // Storage cannot produce duplicates, but computeStats is pure and must not
    // rely on that to stay correct.
    const dates = [d('2026-08-18'), d('2026-08-18'), d('2026-08-19')];
    expect(computeStats(dates, d('2026-08-19')).current).toBe(2);
  });

  test('since is the earliest date, not the first one passed in', () => {
    const dates = [d('2026-08-19'), d('2019-03-02'), d('2022-11-11')];
    expect(computeStats(dates, d('2026-08-19')).since).toBe('2019-03-02');
  });
});
