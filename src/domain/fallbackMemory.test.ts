import { FALLBACK_PERIODS } from './fallbackMemory';

describe('FALLBACK_PERIODS', () => {
  test('is ordered strictly largest days first', () => {
    for (let i = 1; i < FALLBACK_PERIODS.length; i++) {
      expect(FALLBACK_PERIODS[i]!.days).toBeLessThan(FALLBACK_PERIODS[i - 1]!.days);
    }
  });

  test('every period is under a year, capped at 6 months', () => {
    for (const period of FALLBACK_PERIODS) {
      expect(period.days).toBeLessThanOrEqual(180);
      expect(period.days).toBeGreaterThan(0);
    }
  });

  test('every period has a non-empty label', () => {
    for (const period of FALLBACK_PERIODS) {
      expect(period.label.length).toBeGreaterThan(0);
    }
  });
});
