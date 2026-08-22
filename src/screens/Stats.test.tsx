import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { JournalProvider } from '../JournalContext';
import type { Store } from '../domain/store';
import { SqliteStore } from '../storage/SqliteStore';
import { openNodeSqlite } from '../storage/nodeSqlite';
import { StatsScreen, days, statsLines } from './Stats';

jest.mock('../platform/confirm');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { notify } = require('../platform/confirm') as { notify: jest.Mock };

const now = () => new Date('2026-08-19T12:00:00Z');

let store: Store;
beforeEach(async () => {
  store = await SqliteStore.open(openNodeSqlite(':memory:'));
  notify.mockReset();
  notify.mockResolvedValue(undefined);
});
afterEach(async () => {
  await store.close();
});

const renderStats = () =>
  render(
    <JournalProvider store={store} now={now}>
      <StatsScreen />
    </JournalProvider>,
  );

test('an empty journal invites you to start', async () => {
  renderStats();
  await waitFor(() =>
    expect(screen.getByText('No entries yet. Write something today.')).toBeTruthy(),
  );
});

test('renders the four numbers', async () => {
  await store.putAll(
    ['2026-08-17', '2026-08-18', '2026-08-19'].map((date) => ({
      date,
      body: 'x',
      created: `${date}T12:00:00Z`,
      updated: `${date}T12:00:00Z`,
    })),
  );
  renderStats();
  await waitFor(() => expect(screen.getByText('Current streak: 3 days')).toBeTruthy());
  expect(screen.getByText('Longest streak: 3 days')).toBeTruthy();
  expect(screen.getByText('Total entries: 3')).toBeTruthy();
  expect(screen.getByText('Writing since: Mon 17 Aug 2026')).toBeTruthy();
});

// "Nothing crashes on a user's phone" - a rejecting store must reach the user
// as a notification, not an unhandled rejection.
test('a store failure surfaces as a notification rather than a crash', async () => {
  // Explicit binding, not a spread: spreading a class instance copies its own
  // enumerable fields only, so un-overridden methods would come back undefined.
  const broken: Store = {
    get: store.get.bind(store),
    put: store.put.bind(store),
    putAll: store.putAll.bind(store),
    delete: store.delete.bind(store),
    onThisDay: store.onThisDay.bind(store),
    dates: async () => {
      throw new Error('database is locked');
    },
    all: store.all.bind(store),
    close: store.close.bind(store),
  };
  render(
    <JournalProvider store={broken} now={now}>
      <StatsScreen />
    </JournalProvider>,
  );
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith(
      'Could not read your statistics',
      'database is locked',
    ),
  );
});

test('pluralises a day', () => {
  expect(days(1)).toBe('1 day');
  expect(days(0)).toBe('0 days');
  expect(days(5)).toBe('5 days');
});

test('statsLines renders the empty case as one line', () => {
  expect(statsLines({ current: 0, longest: 0, total: 0, since: null })).toEqual([
    'No entries yet. Write something today.',
  ]);
});

// ORDER is part of the contract and getByText cannot pin it - a screen that
// rendered these four lines in any sequence would satisfy every per-line
// query. toEqual on the array pins it at the unit level...
test('statsLines renders the four lines in order', () => {
  expect(statsLines({ current: 5, longest: 9, total: 42, since: '2019-03-02' })).toEqual([
    'Current streak: 5 days',
    'Longest streak: 9 days',
    'Total entries: 42',
    'Writing since: Sat 2 Mar 2019',
  ]);
});

// ...and this pins that the SCREEN actually renders them in that order, using
// the stats-line-<index> testIDs the screen already produces.
test('the screen renders the lines in the order statsLines returns', async () => {
  await store.putAll(
    ['2026-08-17', '2026-08-18', '2026-08-19'].map((date) => ({
      date,
      body: 'x',
      created: `${date}T12:00:00Z`,
      updated: `${date}T12:00:00Z`,
    })),
  );
  renderStats();
  await waitFor(() => expect(screen.getByTestId('stats-line-0')).toBeTruthy());
  expect(
    [0, 1, 2, 3].map((i) => screen.getByTestId(`stats-line-${i}`).props.children),
  ).toEqual([
    'Current streak: 3 days',
    'Longest streak: 3 days',
    'Total entries: 3',
    'Writing since: Mon 17 Aug 2026',
  ]);
});
