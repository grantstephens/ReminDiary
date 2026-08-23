import { act, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Platform, Text } from 'react-native';

import { ThemeProvider, useTheme } from './ThemeContext';

// useColorScheme is a useSyncExternalStore over Appearance's native module,
// which jest's RN environment does not simulate changes to - mocking the
// hook's own module directly is the reliable way to control it in a test.
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const useColorScheme = require('react-native/Libraries/Utilities/useColorScheme')
  .default as jest.Mock;

jest.mock('./platform/themePreference');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getThemeMode, setThemeMode } = require('./platform/themePreference') as {
  getThemeMode: jest.Mock;
  setThemeMode: jest.Mock;
};

function Probe({
  onReady,
}: {
  onReady: (value: ReturnType<typeof useTheme>) => void;
}) {
  const value = useTheme();
  onReady(value);
  return <Text testID="dark">{String(value.theme.dark)}</Text>;
}

let originalOS: typeof Platform.OS;
beforeEach(() => {
  originalOS = Platform.OS;
  getThemeMode.mockReset();
  getThemeMode.mockResolvedValue(null);
  setThemeMode.mockReset();
  setThemeMode.mockResolvedValue(undefined);
  useColorScheme.mockReset();
  useColorScheme.mockReturnValue('light');
});
afterEach(() => {
  Platform.OS = originalOS;
});

test('follows the system color scheme by default', async () => {
  useColorScheme.mockReturnValue('dark');
  await render(
    <ThemeProvider>
      <Probe onReady={() => {}} />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('dark').props.children).toBe('true'));
});

test('an explicit override wins over the system scheme', async () => {
  useColorScheme.mockReturnValue('dark');
  let latest: ReturnType<typeof useTheme> | null = null;
  await render(
    <ThemeProvider>
      <Probe onReady={(v) => { latest = v; }} />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('dark').props.children).toBe('true'));

  await act(async () => {
    latest!.setMode('light');
  });
  await waitFor(() => expect(screen.getByTestId('dark').props.children).toBe('false'));
});

test('setMode persists the choice', async () => {
  let latest: ReturnType<typeof useTheme> | null = null;
  await render(
    <ThemeProvider>
      <Probe onReady={(v) => { latest = v; }} />
    </ThemeProvider>,
  );
  await waitFor(() => expect(latest).not.toBeNull());

  await act(async () => {
    latest!.setMode('dark');
  });
  expect(setThemeMode).toHaveBeenCalledWith('dark');
});

test('loads a persisted override on mount, overriding the system scheme', async () => {
  useColorScheme.mockReturnValue('light');
  getThemeMode.mockResolvedValue('dark');

  await render(
    <ThemeProvider>
      <Probe onReady={() => {}} />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('dark').props.children).toBe('true'));
});

test('on web, always resolves to the light theme regardless of system scheme or override', async () => {
  Platform.OS = 'web';
  useColorScheme.mockReturnValue('dark');
  getThemeMode.mockResolvedValue('dark');

  await render(
    <ThemeProvider>
      <Probe onReady={() => {}} />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('dark').props.children).toBe('false'));
  // The native-only persistence layer is never touched on web.
  expect(getThemeMode).not.toHaveBeenCalled();
});
