import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import App, { handleTabPress } from './App';
import type { UnsavedGuard } from './JournalContext';
import { SqliteStore } from './storage/SqliteStore';
import { openNodeSqlite } from './storage/nodeSqlite';

jest.mock('./storage/openStore');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { openStore } = require('./storage/openStore') as {
  openStore: jest.Mock;
};

test('shows the four tabs once the store opens', async () => {
  openStore.mockResolvedValue(await SqliteStore.open(openNodeSqlite(':memory:')));
  render(<App />);
  // Queried by testID, not by text. A text query for 'Write' is ambiguous the
  // moment a real screen renders that word anywhere in its tree - and the Write
  // screen is exactly where that is likely. testIDs on the tab buttons are
  // stable regardless of what any screen draws.
  await waitFor(() => expect(screen.getByTestId('tab-Write')).toBeTruthy());
  expect(screen.getByTestId('tab-Memories')).toBeTruthy();
  expect(screen.getByTestId('tab-Stats')).toBeTruthy();
  expect(screen.getByTestId('tab-Data')).toBeTruthy();
});

// A failed database open must render something a human can read, not a blank
// screen and not a redbox.
test('renders an error screen when the store will not open', async () => {
  openStore.mockRejectedValue(new Error('disk is on fire'));
  render(<App />);
  await waitFor(() => expect(screen.getByText(/could not open your journal/i)).toBeTruthy());
  expect(screen.getByText(/disk is on fire/)).toBeTruthy();
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

  test('guard registered, another tab pressed, guard resolves true: navigates and clears the guard', async () => {
    const guard = makeGuard(async () => true);
    const e = { preventDefault: jest.fn() };
    const navigation = { isFocused: () => false, navigate: jest.fn() };

    handleTabPress(guard, e, navigation, 'Memories');

    expect(e.preventDefault).toHaveBeenCalled();
    await flush();
    expect(navigation.navigate).toHaveBeenCalledWith('Memories');
    expect(guard.current).toBeNull();
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
