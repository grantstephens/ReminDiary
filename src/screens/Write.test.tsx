import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { JournalProvider, useJournal, type UnsavedGuard } from '../JournalContext';
import { ThemeProvider } from '../ThemeContext';
import type { JournalDate } from '../domain/date';
import type { Store } from '../domain/store';
import { SqliteStore } from '../storage/SqliteStore';
import { openNodeSqlite } from '../storage/nodeSqlite';
import { WriteScreen } from './Write';

jest.mock('../platform/confirm');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { confirm, notify } = require('../platform/confirm') as {
  confirm: jest.Mock;
  notify: jest.Mock;
};

jest.mock('../platform/lifecycle');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { onAppHidden } = require('../platform/lifecycle') as { onAppHidden: jest.Mock };

jest.mock('../platform/themePreference');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getThemeMode } = require('../platform/themePreference') as { getThemeMode: jest.Mock };

const NOW = new Date('2026-08-19T12:00:00Z');
const now = () => NOW;

const onSaved = jest.fn();

async function renderWrite(store: Store) {
  const view = await render(
    <ThemeProvider>
      <JournalProvider store={store} now={now} onSaved={onSaved}>
      <WriteScreen />
      </JournalProvider>
    </ThemeProvider>,
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
  notify.mockReset();
  notify.mockResolvedValue(undefined);
  onAppHidden.mockReset();
  onAppHidden.mockImplementation(() => () => {});
  getThemeMode.mockReset();
  getThemeMode.mockResolvedValue(null);
});
afterEach(async () => {
  await store.close();
});

test('opens on today', async () => {
  await renderWrite(store);
  expect(screen.getByTestId('write-header').props.children).toBe('Wed 19 Aug 2026');
  expect(screen.getByTestId('write-badge').props.children).toBe('today');
});

test('the save button is hidden until you start editing', async () => {
  await renderWrite(store);
  expect(screen.queryByTestId('write-save')).toBeNull();
  await fireEvent(screen.getByTestId('write-body'), 'focus');
  expect(screen.getByTestId('write-save')).toBeTruthy();
});

test('the save button hides again once editing stops', async () => {
  await renderWrite(store);
  await fireEvent(screen.getByTestId('write-body'), 'focus');
  expect(screen.getByTestId('write-save')).toBeTruthy();
  await fireEvent(screen.getByTestId('write-body'), 'blur');
  await waitFor(() => expect(screen.queryByTestId('write-save')).toBeNull());
});

// On the web target, tapping the Save button blurs the still-focused editor
// synchronously before the button's own press event fires - a standard DOM
// race (mousedown blurs the old focus target before its own click lands).
// Hiding the button immediately on blur would unmount it mid-tap and swallow
// that press; the button must survive long enough for the tap to land.
test('a blur immediately before a press does not swallow the press', async () => {
  await renderWrite(store);
  await fireEvent(screen.getByTestId('write-body'), 'focus');
  await fireEvent.changeText(screen.getByTestId('write-body'), 'a good day');

  await fireEvent(screen.getByTestId('write-body'), 'blur');
  expect(screen.getByTestId('write-save')).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByTestId('write-save'));
  });

  await waitFor(async () => {
    expect((await store.get('2026-08-19'))?.body).toBe('a good day');
  });
});

// The button always reads the same thing, whatever save() will actually do -
// write, delete-after-confirming, or nothing on a blank day. The confirm
// dialog is what explains a delete; the button is just "go".
test('the save button always says Take Me to Memories →', async () => {
  await store.put({
    date: '2026-08-19',
    body: 'keep me',
    created: '2020-01-01T00:00:00Z',
    updated: '2020-01-01T00:00:00Z',
  });
  await renderWrite(store);
  await fireEvent(screen.getByTestId('write-body'), 'focus');
  expect(screen.getByText('Take Me to Memories →')).toBeTruthy();
  await fireEvent.changeText(screen.getByTestId('write-body'), '');
  expect(screen.getByText('Take Me to Memories →')).toBeTruthy();
});

test('saving writes the entry', async () => {
  await renderWrite(store);
  await fireEvent(screen.getByTestId('write-body'), 'focus');
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
  await fireEvent(screen.getByTestId('write-body'), 'focus');
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
  await fireEvent(screen.getByTestId('write-body'), 'focus');
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
  await fireEvent(screen.getByTestId('write-body'), 'focus');
  await fireEvent.changeText(screen.getByTestId('write-body'), '');
  await act(async () => {
    fireEvent.press(screen.getByTestId('write-save'));
  });
  expect((await store.get('2026-08-19'))?.body).toBe('keep me');
});

test('saving a blank editor on a blank day writes nothing', async () => {
  await renderWrite(store);
  await fireEvent(screen.getByTestId('write-body'), 'focus');
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

// "Nothing crashes on a user's phone" is a stated invariant with, until now, no
// test at all: a store that throws must surface through notify, not propagate.
test('a store failure surfaces as a notification rather than a crash', async () => {
  // A plain `{ ...store, put: ... }` spread would silently drop SqliteStore's
  // prototype methods (put, get, ...) - a class instance's own enumerable
  // properties are just its constructor-assigned fields, not its methods -
  // so every delegated call is bound explicitly instead.
  const broken: Store = {
    get: store.get.bind(store),
    put: async () => {
      throw new Error('disk is full');
    },
    putAll: store.putAll.bind(store),
    delete: store.delete.bind(store),
    onThisDay: store.onThisDay.bind(store),
    dates: store.dates.bind(store),
    all: store.all.bind(store),
    close: store.close.bind(store),
  };
  await render(
    <ThemeProvider>
      <JournalProvider store={broken} now={now} onSaved={onSaved}>
      <WriteScreen />
      </JournalProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('write-header')).toBeTruthy());

  await fireEvent(screen.getByTestId('write-body'), 'focus');
  await fireEvent.changeText(screen.getByTestId('write-body'), 'a good day');
  await act(async () => {
    fireEvent.press(screen.getByTestId('write-save'));
  });

  expect(notify).toHaveBeenCalledWith('Could not save that entry', 'disk is full');
  // The soft gate must NOT fire on a failed save.
  expect(onSaved).not.toHaveBeenCalled();
});

test('stepping to another day with unsaved edits saves silently, without asking', async () => {
  await renderWrite(store);
  await fireEvent.changeText(screen.getByTestId('write-body'), 'unsaved');
  await act(async () => {
    fireEvent.press(screen.getByTestId('write-prev'));
  });
  expect(confirm).not.toHaveBeenCalled();
  await waitFor(async () => {
    expect((await store.get('2026-08-19'))?.body).toBe('unsaved');
  });
  expect(screen.getByTestId('write-header').props.children).toBe('Tue 18 Aug 2026');
  // A silent save on the way out is not the deliberate "I'm done" save.
  expect(onSaved).not.toHaveBeenCalled();
});

test('stepping to another day after clearing an existing entry reverts it instead of deleting', async () => {
  await store.put({
    date: '2026-08-19',
    body: 'keep me',
    created: '2020-01-01T00:00:00Z',
    updated: '2020-01-01T00:00:00Z',
  });
  await renderWrite(store);
  await fireEvent.changeText(screen.getByTestId('write-body'), '');
  await act(async () => {
    fireEvent.press(screen.getByTestId('write-prev'));
  });
  expect(confirm).not.toHaveBeenCalled();
  expect((await store.get('2026-08-19'))?.body).toBe('keep me');
});

function GuardProbe({ onReady }: { onReady: (g: React.MutableRefObject<UnsavedGuard | null>) => void }) {
  const { guard } = useJournal();
  onReady(guard);
  return null;
}

// This is the guard App.tsx's handleTabPress consults directly before a tab
// switch, distinct from the step()/save() paths above.
test('the guard silently saves unsaved edits, then re-arms on further typing', async () => {
  let guardRef: React.MutableRefObject<UnsavedGuard | null> | null = null;
  await render(
    <ThemeProvider>
      <JournalProvider store={store} now={now} onSaved={onSaved}>
      <WriteScreen />
      <GuardProbe onReady={(g) => { guardRef = g; }} />
      </JournalProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('write-header')).toBeTruthy());

  await fireEvent.changeText(screen.getByTestId('write-body'), 'unsaved words');
  await waitFor(() => expect(guardRef!.current).not.toBeNull());

  let allowed = false;
  await act(async () => {
    allowed = await guardRef!.current!();
  });
  expect(allowed).toBe(true);
  expect(confirm).not.toHaveBeenCalled();
  await waitFor(async () => {
    expect((await store.get('2026-08-19'))?.body).toBe('unsaved words');
  });
  // A silent save is not the deliberate "I'm done" save.
  expect(onSaved).not.toHaveBeenCalled();

  // Clean editor: the guard disarms, so a later tab press does nothing.
  await waitFor(() => expect(guardRef!.current).toBeNull());

  // Typing again re-arms it. This is the assertion the one-shot bug failed.
  await fireEvent.changeText(screen.getByTestId('write-body'), 'more words');
  await waitFor(() => expect(guardRef!.current).not.toBeNull());
  await act(async () => {
    await guardRef!.current!();
  });
  await waitFor(async () => {
    expect((await store.get('2026-08-19'))?.body).toBe('more words');
  });
});

test('the guard reverts a cleared entry instead of deleting it', async () => {
  await store.put({
    date: '2026-08-19',
    body: 'keep me',
    created: '2020-01-01T00:00:00Z',
    updated: '2020-01-01T00:00:00Z',
  });
  let guardRef: React.MutableRefObject<UnsavedGuard | null> | null = null;
  await render(
    <ThemeProvider>
      <JournalProvider store={store} now={now} onSaved={onSaved}>
      <WriteScreen />
      <GuardProbe onReady={(g) => { guardRef = g; }} />
      </JournalProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('write-header')).toBeTruthy());

  await fireEvent.changeText(screen.getByTestId('write-body'), '');
  await waitFor(() => expect(guardRef!.current).not.toBeNull());

  let allowed = false;
  await act(async () => {
    allowed = await guardRef!.current!();
  });
  expect(allowed).toBe(true);
  expect(confirm).not.toHaveBeenCalled();
  expect((await store.get('2026-08-19'))?.body).toBe('keep me');
  expect(screen.getByTestId('write-body').props.value).toBe('keep me');
});

test('a failing silent save blocks navigation, notifies, and keeps the guard armed', async () => {
  const broken: Store = {
    get: store.get.bind(store),
    put: async () => {
      throw new Error('disk is full');
    },
    putAll: store.putAll.bind(store),
    delete: store.delete.bind(store),
    onThisDay: store.onThisDay.bind(store),
    dates: store.dates.bind(store),
    all: store.all.bind(store),
    close: store.close.bind(store),
  };
  let guardRef: React.MutableRefObject<UnsavedGuard | null> | null = null;
  await render(
    <ThemeProvider>
      <JournalProvider store={broken} now={now} onSaved={onSaved}>
      <WriteScreen />
      <GuardProbe onReady={(g) => { guardRef = g; }} />
      </JournalProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('write-header')).toBeTruthy());

  await fireEvent.changeText(screen.getByTestId('write-body'), 'unsaved');
  await waitFor(() => expect(guardRef!.current).not.toBeNull());

  let allowed = true;
  await act(async () => {
    allowed = await guardRef!.current!();
  });
  expect(allowed).toBe(false);
  expect(notify).toHaveBeenCalledWith('Could not save that entry', 'disk is full');
  expect(guardRef!.current).not.toBeNull();
  expect(screen.getByTestId('write-body').props.value).toBe('unsaved');
});

test('backgrounding the app silently saves unsaved edits', async () => {
  let hidden: (() => void) | null = null;
  onAppHidden.mockImplementation((cb: () => void) => {
    hidden = cb;
    return () => {};
  });
  await renderWrite(store);
  await fireEvent.changeText(screen.getByTestId('write-body'), 'unsaved');
  await waitFor(() => expect(hidden).not.toBeNull());

  await act(async () => {
    hidden!();
  });
  await waitFor(async () => {
    expect((await store.get('2026-08-19'))?.body).toBe('unsaved');
  });
});

// silentSave gets a new identity on every keystroke (it closes over `text`).
// Subscribing to onAppHidden with it as a direct effect dependency would
// tear down and re-add the underlying native AppState / DOM visibilitychange
// listener on every character typed instead of once per mount.
test('the app-hidden subscription is not torn down and re-added on every keystroke', async () => {
  await renderWrite(store);
  await fireEvent.changeText(screen.getByTestId('write-body'), 'a');
  await fireEvent.changeText(screen.getByTestId('write-body'), 'ab');
  await fireEvent.changeText(screen.getByTestId('write-body'), 'abc');
  expect(onAppHidden).toHaveBeenCalledTimes(1);
});

function OpenWriteProbe({ onReady }: { onReady: (fn: (date: JournalDate) => void) => void }) {
  const { openWrite } = useJournal();
  onReady(openWrite);
  return null;
}

// This is what Memories tapping an entry drives - openWrite() on the shared
// context, not a navigator prop, so this needs no navigator to test.
test('opening a memory loads that date, silently saving unsaved edits to today first', async () => {
  await store.put({
    date: '2026-08-10',
    body: 'old memory',
    created: '2020-01-01T00:00:00Z',
    updated: '2020-01-01T00:00:00Z',
  });
  let openWrite: ((date: JournalDate) => void) | null = null;
  await render(
    <ThemeProvider>
      <JournalProvider store={store} now={now} onSaved={onSaved}>
      <WriteScreen />
      <OpenWriteProbe onReady={(fn) => { openWrite = fn; }} />
      </JournalProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('write-header')).toBeTruthy());

  await fireEvent.changeText(screen.getByTestId('write-body'), 'unsaved edit for today');
  await act(async () => {
    openWrite!('2026-08-10');
  });

  await waitFor(() => expect(screen.getByTestId('write-body').props.value).toBe('old memory'));
  expect(screen.getByTestId('write-badge').props.children).toBe('');
  await waitFor(async () => {
    expect((await store.get('2026-08-19'))?.body).toBe('unsaved edit for today');
  });
});
