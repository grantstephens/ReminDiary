import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { JournalProvider, useJournal, type JournalValue } from '../JournalContext';
import type { Entry } from '../domain/entry';
import type { Store } from '../domain/store';
import { SqliteStore } from '../storage/SqliteStore';
import { openNodeSqlite } from '../storage/nodeSqlite';
import { MemoriesScreen, yearsAgoLabel } from './Memories';

jest.mock('../platform/confirm');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { notify } = require('../platform/confirm') as { notify: jest.Mock };

// Deliberately NOT the real current year. Every other suite pins a date in the
// present, which means a screen that read the wall clock instead of the
// injected now() would coincidentally still pass. Here it cannot.
const now = () => new Date('2031-08-19T12:00:00Z');
const entry = (date: string, body: string): Entry => ({
  date,
  body,
  created: `${date}T12:00:00Z`,
  updated: `${date}T12:00:00Z`,
});

let store: Store;
beforeEach(async () => {
  store = await SqliteStore.open(openNodeSqlite(':memory:'));
  notify.mockReset();
  notify.mockResolvedValue(undefined);
});
afterEach(async () => {
  await store.close();
});

const renderMemories = () =>
  render(
    <JournalProvider store={store} now={now}>
      <MemoriesScreen />
    </JournalProvider>,
  );

test('shows previous years newest first', async () => {
  await store.putAll([
    entry('2022-08-19', 'nine years ago'),
    entry('2030-08-19', 'last year'),
    entry('2025-08-19', 'six years ago'),
  ]);
  await renderMemories();
  await waitFor(() => expect(screen.getByText('last year')).toBeTruthy());

  const headings = screen.getAllByTestId(/memories-heading-/);
  expect(headings.map((h) => h.props.children)).toEqual([
    '2030 — 1 year ago',
    '2025 — 6 years ago',
    '2022 — 9 years ago',
  ]);
});

// The current year is what you just wrote. This screen is about the others.
test('excludes the current year', async () => {
  await store.putAll([entry('2031-08-19', 'today'), entry('2030-08-19', 'last year')]);
  await renderMemories();
  await waitFor(() => expect(screen.getByText('last year')).toBeTruthy());
  expect(screen.queryByText('today')).toBeNull();
});

// Split rather than combined: when this fails you want to know WHICH axis
// broke, and a screen this thin on tests is the wrong place to economise.
test('ignores the same month on a different day', async () => {
  await store.putAll([entry('2030-08-18', 'wrong day')]);
  await renderMemories();
  await waitFor(() => expect(screen.getByTestId('memories-empty')).toBeTruthy());
});

test('ignores the same day in a different month', async () => {
  await store.putAll([entry('2030-09-19', 'wrong month')]);
  await renderMemories();
  await waitFor(() => expect(screen.getByTestId('memories-empty')).toBeTruthy());
});

// Belt and braces. The storage contract already pins leap-day exactness via
// substr(date, 6); this asserts the screen adds no date fuzzing of its own.
test('a leap day matches only a leap day', async () => {
  const leapNow = () => new Date('2032-02-29T12:00:00Z');
  await store.putAll([entry('2028-02-29', 'leap'), entry('2029-02-28', 'not leap')]);
  await render(
    <JournalProvider store={store} now={leapNow}>
      <MemoriesScreen />
    </JournalProvider>,
  );
  await waitFor(() => expect(screen.getByText('leap')).toBeTruthy());
  expect(screen.queryByText('not leap')).toBeNull();
});

// "Nothing crashes on a user's phone" - the invariant Task 10's review found
// stated everywhere and tested nowhere. A rejecting store must reach the user
// as a notification, not an unhandled rejection.
test('a store failure surfaces as a notification rather than a crash', async () => {
  // Explicit binding, not a spread: spreading a class instance copies its own
  // enumerable fields only, so un-overridden methods would come back undefined.
  const broken: Store = {
    get: store.get.bind(store),
    put: store.put.bind(store),
    putAll: store.putAll.bind(store),
    delete: store.delete.bind(store),
    onThisDay: async () => {
      throw new Error('database is locked');
    },
    dates: store.dates.bind(store),
    all: store.all.bind(store),
    close: store.close.bind(store),
  };
  await render(
    <JournalProvider store={broken} now={now}>
      <MemoriesScreen />
    </JournalProvider>,
  );
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith('Could not read your memories', 'database is locked'),
  );
});

test('the empty state names the day', async () => {
  await renderMemories();
  await waitFor(() => {
    expect(screen.getByTestId('memories-empty').props.children).toBe(
      'Nothing from previous years yet. Come back next 19 August.',
    );
  });
});

function OpenDateProbe({ onReady }: { onReady: (value: JournalValue['openDate']) => void }) {
  const { openDate } = useJournal();
  onReady(openDate);
  return null;
}

test('tapping an entry asks to open it for editing', async () => {
  await store.putAll([entry('2030-08-19', 'last year')]);
  let latest: JournalValue['openDate'] = null;
  await render(
    <JournalProvider store={store} now={now}>
      <MemoriesScreen />
      <OpenDateProbe onReady={(value) => { latest = value; }} />
    </JournalProvider>,
  );
  await waitFor(() => expect(screen.getByText('last year')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('memories-item-2030'));
  });
  expect(latest!.date).toBe('2030-08-19');
});

test('pluralises the year label', () => {
  expect(yearsAgoLabel(1)).toBe('1 year ago');
  expect(yearsAgoLabel(2)).toBe('2 years ago');
  expect(yearsAgoLabel(9)).toBe('9 years ago');
});
