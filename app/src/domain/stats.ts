import { addDays, type JournalDate } from './date';

/**
 * Stats are the numbers on the Stats screen. They are always derived from the
 * set of dates that have entries and never stored, which rules out a whole
 * class of cache-invalidation bugs.
 */
export interface Stats {
  /**
   * current is the number of consecutive days written, ending today or, if
   * today is not written yet, ending yesterday.
   */
  current: number;
  /** longest is the longest run of consecutive days anywhere in the data. */
  longest: number;
  /** total is the number of entries. */
  total: number;
  /** since is the earliest date with an entry, null when there are none. */
  since: JournalDate | null;
}

/**
 * computeStats derives statistics from the dates that have entries. The input
 * need not be sorted and need not be free of duplicates.
 */
export function computeStats(dates: JournalDate[], today: JournalDate): Stats {
  if (dates.length === 0) {
    return { current: 0, longest: 0, total: 0, since: null };
  }

  const present = new Set(dates);
  const sorted = [...present].sort(); // lexicographic order is chronological order

  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (addDays(sorted[i - 1]!, 1) === sorted[i]) {
      run++;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
  }

  // The grace rule: an unwritten today does not end the streak, an unwritten
  // yesterday does.
  let cursor = present.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (present.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  return { current, longest, total: dates.length, since: sorted[0]! };
}
