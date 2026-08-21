// Every Jest project in this file runs in a fixed NEGATIVE-offset zone, set
// here because Jest's node environment deep-copies process.env at setup: a
// test cannot change TZ at runtime and have Date's local-time methods see it
// (jestjs/jest#9856).
//
// The sign matters. Dates anchor at midnight UTC, so under a POSITIVE offset
// the local calendar date is always the same as the UTC one and a function
// that wrongly read local fields would still produce correct output - the
// tests would pass on a broken implementation. Under Los Angeles (-7/-8),
// midnight UTC is the previous afternoon locally, so any local-time leak in
// date arithmetic or display renders a day early and fails loudly.
process.env.TZ = 'America/Los_Angeles';

module.exports = {
  projects: [
    {
      displayName: 'logic',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/(domain|storage|csv)/**/*.test.ts'],
      transform: {
        '^.+\\.tsx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
      },
    },
    {
      displayName: 'screens',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/src/**/*.test.tsx'],
    },
  ],
};
