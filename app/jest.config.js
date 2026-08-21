// The logic suite runs in a fixed NON-UTC zone, set here because Jest's node
// environment deep-copies process.env at setup: a test cannot change TZ at
// runtime and have Date's local-time methods see it (jestjs/jest#9856).
// Pinning a non-UTC zone is the stronger arrangement anyway - a UTC-only
// machine hides every accidental local-time leak in date arithmetic.
process.env.TZ = 'Pacific/Auckland';

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
