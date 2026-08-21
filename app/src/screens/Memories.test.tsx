import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { JournalProvider } from '../JournalContext';
import type { Entry } from '../domain/entry';
import type { Store } from '../domain/store';
import { SqliteStore } from '../storage/SqliteStore';
import { openNodeSqlite } from '../storage/nodeSqlite';
import { MemoriesScreen, yearsAgoLabel } from './Memories';

const now = () => new Date('2026-08-19T12:00:00Z');
const entry = (date: string, body: string): Entry => ({
  date,
  body,
  created: `${date}T12:00:00Z`,
  updated: `${date}T12:00:00Z`,
});

let store: Store;
beforeEach(async () => {
  store = await SqliteStore.open(openNodeSqlite(':memory:'));
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
    entry('2017-08-19', 'nine years ago'),
    entry('2025-08-19', 'last year'),
    entry('2020-08-19', 'six years ago'),
  ]);
  renderMemories();
  await waitFor(() => expect(screen.getByText('last year')).toBeTruthy());

  const headings = screen.getAllByTestId(/memories-heading-/);
  expect(headings.map((h) => h.props.children)).toEqual([
    '2025 — 1 year ago',
    '2020 — 6 years ago',
    '2017 — 9 years ago',
  ]);
});

// The current year is what you just wrote. This screen is about the others.
test('excludes the current year', async () => {
  await store.putAll([entry('2026-08-19', 'today'), entry('2025-08-19', 'last year')]);
  renderMemories();
  await waitFor(() => expect(screen.getByText('last year')).toBeTruthy());
  expect(screen.queryByText('today')).toBeNull();
});

test('ignores other days', async () => {
  await store.putAll([entry('2025-08-18', 'wrong day'), entry('2025-09-19', 'wrong month')]);
  renderMemories();
  await waitFor(() => expect(screen.getByTestId('memories-empty')).toBeTruthy());
});

test('the empty state names the day', async () => {
  renderMemories();
  await waitFor(() => {
    expect(screen.getByTestId('memories-empty').props.children).toBe(
      'Nothing from previous years yet. Come back next 19 August.',
    );
  });
});

test('pluralises the year label', () => {
  expect(yearsAgoLabel(1)).toBe('1 year ago');
  expect(yearsAgoLabel(2)).toBe('2 years ago');
  expect(yearsAgoLabel(9)).toBe('9 years ago');
});
