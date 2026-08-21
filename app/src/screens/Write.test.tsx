import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { JournalProvider } from '../JournalContext';
import type { Store } from '../domain/store';
import { SqliteStore } from '../storage/SqliteStore';
import { openNodeSqlite } from '../storage/nodeSqlite';
import { WriteScreen } from './Write';

jest.mock('../platform/confirm');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { confirm } = require('../platform/confirm') as { confirm: jest.Mock };

const NOW = new Date('2026-08-19T12:00:00Z');
const now = () => NOW;

const onSaved = jest.fn();

async function renderWrite(store: Store) {
  const view = render(
    <JournalProvider store={store} now={now} onSaved={onSaved}>
      <WriteScreen />
    </JournalProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('write-header')).toBeTruthy());
  return view;
}

let store: Store;
beforeEach(async () => {
  store = await SqliteStore.open(openNodeSqlite(':memory:'));
  onSaved.mockReset();
  confirm.mockReset();
  confirm.mockResolvedValue(true);
});
afterEach(async () => {
  await store.close();
});

test('opens on today', async () => {
  await renderWrite(store);
  expect(screen.getByTestId('write-header').props.children).toBe('Wed 19 Aug 2026');
  expect(screen.getByTestId('write-badge').props.children).toBe('today');
});

test('saving writes the entry', async () => {
  await renderWrite(store);
  // fireEvent.changeText is awaited here (the task-10-brief's listing omits
  // this await): RNTL's fireEvent wraps every dispatch in its own act()
  // scope, and leaving that scope's promise un-awaited while a second,
  // overlapping act() scope opens right after (the press below) corrupts
  // React's global act bookkeeping for the rest of the test file - every
  // later render() silently stops committing. Confirmed with a Write.tsx
  // independent repro; see task-10-report.md.
  await fireEvent.changeText(screen.getByTestId('write-body'), 'a good day');
  await act(async () => {
    fireEvent.press(screen.getByTestId('write-save'));
  });
  await waitFor(async () => {
    expect((await store.get('2026-08-19'))?.body).toBe('a good day');
  });
  // The soft gate fires, which is what App turns into "show me Memories".
  expect(onSaved).toHaveBeenCalledWith('2026-08-19');
});

test('editing preserves the original created timestamp', async () => {
  await store.put({
    date: '2026-08-19',
    body: 'first',
    created: '2020-01-01T00:00:00Z',
    updated: '2020-01-01T00:00:00Z',
  });
  await renderWrite(store);
  await fireEvent.changeText(screen.getByTestId('write-body'), 'second');
  await act(async () => {
    fireEvent.press(screen.getByTestId('write-save'));
  });
  await waitFor(async () => {
    expect(await store.get('2026-08-19')).toEqual({
      date: '2026-08-19',
      body: 'second',
      created: '2020-01-01T00:00:00Z',
      updated: '2026-08-19T12:00:00Z',
    });
  });
});

test('clearing an entry and saving deletes it, after confirming', async () => {
  await store.put({
    date: '2026-08-19',
    body: 'delete me',
    created: '2020-01-01T00:00:00Z',
    updated: '2020-01-01T00:00:00Z',
  });
  await renderWrite(store);
  await fireEvent.changeText(screen.getByTestId('write-body'), '');
  await act(async () => {
    fireEvent.press(screen.getByTestId('write-save'));
  });
  expect(confirm).toHaveBeenCalledWith(
    'Delete this entry?',
    'Saving an empty entry for Wed 19 Aug 2026 deletes it.',
  );
  await waitFor(async () => {
    expect(await store.get('2026-08-19')).toBeNull();
  });
});

test('declining the delete keeps the entry', async () => {
  confirm.mockResolvedValue(false);
  await store.put({
    date: '2026-08-19',
    body: 'keep me',
    created: '2020-01-01T00:00:00Z',
    updated: '2020-01-01T00:00:00Z',
  });
  await renderWrite(store);
  await fireEvent.changeText(screen.getByTestId('write-body'), '');
  await act(async () => {
    fireEvent.press(screen.getByTestId('write-save'));
  });
  expect((await store.get('2026-08-19'))?.body).toBe('keep me');
});

test('saving a blank editor on a blank day writes nothing', async () => {
  await renderWrite(store);
  await act(async () => {
    fireEvent.press(screen.getByTestId('write-save'));
  });
  await expect(store.dates()).resolves.toEqual([]);
  expect(confirm).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
});

test('the back arrow steps a day and loads that entry', async () => {
  await store.put({
    date: '2026-08-18',
    body: 'yesterday',
    created: '2026-08-18T12:00:00Z',
    updated: '2026-08-18T12:00:00Z',
  });
  await renderWrite(store);
  await act(async () => {
    fireEvent.press(screen.getByTestId('write-prev'));
  });
  await waitFor(() => {
    expect(screen.getByTestId('write-header').props.children).toBe('Tue 18 Aug 2026');
  });
  expect(screen.getByTestId('write-body').props.value).toBe('yesterday');
  expect(screen.getByTestId('write-badge').props.children).toBe('');
});

// Future-dated entries are out of scope, so the forward arrow stops at today.
test('the forward arrow is disabled on today', async () => {
  await renderWrite(store);
  expect(screen.getByTestId('write-next').props.accessibilityState.disabled).toBe(true);
});

test('stepping away with unsaved edits asks first', async () => {
  await renderWrite(store);
  await fireEvent.changeText(screen.getByTestId('write-body'), 'unsaved');
  await act(async () => {
    fireEvent.press(screen.getByTestId('write-prev'));
  });
  expect(confirm).toHaveBeenCalledWith(
    'Discard changes?',
    'Your unsaved changes to Wed 19 Aug 2026 will be lost.',
  );
});

test('declining the discard stays put', async () => {
  confirm.mockResolvedValue(false);
  await renderWrite(store);
  await fireEvent.changeText(screen.getByTestId('write-body'), 'unsaved');
  await act(async () => {
    fireEvent.press(screen.getByTestId('write-prev'));
  });
  expect(screen.getByTestId('write-header').props.children).toBe('Wed 19 Aug 2026');
  expect(screen.getByTestId('write-body').props.value).toBe('unsaved');
});
