/**
 * The fallback ladder for the Memories screen: when there is no entry for
 * today's month/day in any previous year, the screen instead looks back
 * across these offsets, largest first, and shows the first one with a real
 * entry. Ordering it largest-to-smallest means the search is a single
 * top-down loop that stops at the first hit — the most "interesting" (oldest)
 * period wins.
 *
 * Capped at 6 months: past that, an account is close enough to a year old
 * that the real years-ago anniversary feature is the more meaningful thing
 * to wait for.
 */
export interface FallbackPeriod {
  days: number;
  label: string;
}

export const FALLBACK_PERIODS: FallbackPeriod[] = [
  { days: 180, label: '6 months ago' },
  { days: 100, label: '100 days ago' },
  { days: 60, label: '2 months ago' },
  { days: 30, label: '1 month ago' },
  { days: 21, label: '3 weeks ago' },
  { days: 14, label: '2 weeks ago' },
  { days: 10, label: '10 days ago' },
  { days: 7, label: '7 days ago' },
];
