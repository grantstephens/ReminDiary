import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import App, { handleStateChange, handleTabPress } from './App';
import { today } from './domain/date';
import type { UnsavedGuard } from './JournalContext';
import { SqliteStore } from './storage/SqliteStore';
import { openNodeSqlite } from './storage/nodeSqlite';

jest.mock('./storage/openStore');
jest.mock('./platform/analytics');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { openStore } = require('./storage/openStore') as {
  openStore: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getAnalyticsEnabled, setAnalyticsEnabled, trackScreenView } = require(
  './platform/analytics',
) as {
  getAnalyticsEnabled: jest.Mock;
  setAnalyticsEnabled: jest.Mock;
  trackScreenView: jest.Mock;
};

beforeEach(() => {
  getAnalyticsEnabled.mockReset();
  getAnalyticsEnabled.mockResolvedValue(false);
  setAnalyticsEnabled.mockReset();
  setAnalyticsEnabled.mockResolvedValue(undefined);
  trackScreenView.mockReset();
  trackScreenView.mockResolvedValue(undefined);
});

test('shows the three tabs once the store opens', async () => {
  openStore.mockResolvedValue(await SqliteStore.open(openNodeSqlite(':memory:')));
  await render(<App />);
  // Queried by testID, not by text. A text query for 'Write' is ambiguous the
  // moment a real screen renders that word anywhere in its tree - and the Write
  // screen is exactly where that is likely. testIDs on the tab buttons are
  // stable regardless of what any screen draws.
  await waitFor(() => expect(screen.getByTestId('tab-Write')).toBeTruthy());
  expect(screen.getByTestId('tab-Memories')).toBeTruthy();
  expect(screen.getByTestId('tab-Settings')).toBeTruthy();
});

// A failed database open must render something a human can read, not a blank
// screen and not a redbox.
test('renders an error screen when the store will not open', async () => {
  openStore.mockRejectedValue(new Error('disk is on fire'));
  await render(<App />);
  await waitFor(() => expect(screen.getByText(/could not open your journal/i)).toBeTruthy());
  expect(screen.getByText(/disk is on fire/)).toBeTruthy();
});

// The end-to-end path Memories' tap-to-edit relies on: openWrite() switches
// tabs via the real navigator, not just a context value change.
test('tapping a memory entry switches to Write with that date loaded', async () => {
  const store = await SqliteStore.open(openNodeSqlite(':memory:'));
  // today() reads LOCAL calendar fields (see domain/date.ts) - App itself
  // has no injected `now`, so "today" here has to be computed the same way
  // the app computes it. An earlier version of this test used
  // Date.UTC(...getUTCFullYear()...), which drifts from what the app
  // considers "today" whenever the real local and UTC calendar dates
  // differ (this project pins tests to America/Los_Angeles specifically
  // to expose exactly that class of bug) - it read as correct until the
  // real clock crossed that boundary.
  const [year, month, day] = today(new Date()).split('-');
  const lastYearNum = Number(year) - 1;
  const iso = `${lastYearNum}-${month}-${day}`;
  await store.put({
    date: iso,
    body: 'from last year',
    created: `${iso}T12:00:00Z`,
    updated: `${iso}T12:00:00Z`,
  });
  openStore.mockResolvedValue(store);

  await render(<App />);
  await waitFor(() => expect(screen.getByTestId('tab-Write')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('tab-Memories'));
  });
  await waitFor(() => expect(screen.getByText('from last year')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId(`memories-item-${lastYearNum}`));
  });

  await waitFor(() => expect(screen.getByTestId('write-body').props.value).toBe('from last year'));
});

// handleTabPress is unreachable inline (it lives inside screenListeners,
// which needs a mounted navigator to fire), but it is the only thing
// standing between a user and silently losing unsaved diary text, so it is
// exported and tested directly here with a plain object standing in for the
// navigation prop - no navigator required.
describe('handleTabPress', () => {
  function makeGuard(
    value: UnsavedGuard | null,
  ): React.MutableRefObject<UnsavedGuard | null> {
    return { current: value };
  }

  // Flushes pending microtasks (the guard's .then chain) without assuming how
  // many ticks it takes - a real macrotask boundary always runs after every
  // microtask queued before it.
  function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  test('no guard registered: preventDefault is not called', () => {
    const guard = makeGuard(null);
    const e = { preventDefault: jest.fn() };
    const navigation = { isFocused: () => false, navigate: jest.fn() };

    handleTabPress(guard, e, navigation, 'Memories');

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  test('guard registered but the pressed tab is already focused: preventDefault is not called', () => {
    const guard = makeGuard(async () => true);
    const e = { preventDefault: jest.fn() };
    const navigation = { isFocused: () => true, navigate: jest.fn() };

    handleTabPress(guard, e, navigation, 'Write');

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  test('guard registered, another tab pressed, guard resolves true: navigates and leaves the guard unchanged', async () => {
    const check: UnsavedGuard = async () => true;
    const guard = makeGuard(check);
    const e = { preventDefault: jest.fn() };
    const navigation = { isFocused: () => false, navigate: jest.fn() };

    handleTabPress(guard, e, navigation, 'Memories');

    expect(e.preventDefault).toHaveBeenCalled();
    await flush();
    expect(navigation.navigate).toHaveBeenCalledWith('Memories');
    // NOT cleared here. Clearing it made the guard one-shot: after a single
    // confirmed discard, every later tab press navigated away in silence
    // because the arming effect (deps [dirty, date, guard]) never re-ran.
    // Write's own effect owns disarming the guard when it stops being dirty.
    expect(guard.current).toBe(check);
  });

  test('guard registered, another tab pressed, guard resolves false: does not navigate and keeps the guard', async () => {
    const check: UnsavedGuard = async () => false;
    const guard = makeGuard(check);
    const e = { preventDefault: jest.fn() };
    const navigation = { isFocused: () => false, navigate: jest.fn() };

    handleTabPress(guard, e, navigation, 'Memories');

    expect(e.preventDefault).toHaveBeenCalled();
    await flush();
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(guard.current).toBe(check);
  });
});

// Switching tabs is the one place a screen view happens in this app - there
// is no URL-based routing to hook into instead, since it is a single-page
// tab bar rather than a stack. Verified through the real navigator (not just
// handleStateChange in isolation below) because this is the one path that
// proves onStateChange is actually wired into NavigationContainer.
test('switching tabs reports a screen view for the tab navigated to', async () => {
  openStore.mockResolvedValue(await SqliteStore.open(openNodeSqlite(':memory:')));
  await render(<App />);
  await waitFor(() => expect(screen.getByTestId('tab-Write')).toBeTruthy());
  // The initial route reports too, once the navigator is ready.
  await waitFor(() => expect(trackScreenView).toHaveBeenCalledWith('Write'));

  await act(async () => {
    fireEvent.press(screen.getByTestId('tab-Settings'));
  });
  await waitFor(() => expect(trackScreenView).toHaveBeenCalledWith('Settings'));
});

// handleStateChange is unreachable inline (it lives in NavigationContainer's
// onStateChange prop, which needs a mounted navigator to fire), so it is
// exported and tested directly here too - same reasoning as handleTabPress.
describe('handleStateChange', () => {
  test('reports the currently focused route', () => {
    handleStateChange({ index: 1, routes: [{ name: 'Write' }, { name: 'Memories' }] });
    expect(trackScreenView).toHaveBeenCalledWith('Memories');
  });

  test('does nothing when state is not ready yet', () => {
    handleStateChange(undefined);
    expect(trackScreenView).not.toHaveBeenCalled();
  });
});
