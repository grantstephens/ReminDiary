import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { Text } from 'react-native';

import { JournalProvider, useJournal } from '../JournalContext';
import type { Store } from '../domain/store';
import { SqliteStore } from '../storage/SqliteStore';
import { openNodeSqlite } from '../storage/nodeSqlite';
import { SettingsScreen, days, formatImportResult, statsLines } from './Settings';

jest.mock('../platform/files');
jest.mock('../platform/confirm');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pickCsv, saveCsv } = require('../platform/files') as {
  pickCsv: jest.Mock;
  saveCsv: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { confirm, notify } = require('../platform/confirm') as {
  confirm: jest.Mock;
  notify: jest.Mock;
};

const now = () => new Date('2026-08-19T12:00:00Z');
const CSV = 'date,body,created,updated\n2026-08-19,hello,,\n';

let store: Store;
beforeEach(async () => {
  store = await SqliteStore.open(openNodeSqlite(':memory:'));
  [pickCsv, saveCsv, confirm, notify].forEach((m) => m.mockReset());
  confirm.mockResolvedValue(true);
  notify.mockResolvedValue(undefined);
});
afterEach(async () => {
  await store.close();
});

/** Renders the revision counter so a missing bump() is visible from a test. */
function RevisionProbe() {
  const { revision } = useJournal();
  return <Text testID="revision">{String(revision)}</Text>;
}

// render() in this @testing-library/react-native version resolves
// asynchronously (concurrent-root rendering), so a bare call races the
// screen queries that follow it. renderSettings waits for a stable element
// before returning, the same convention Write.test.tsx's renderWrite uses.
const renderSettings = async (target: Store = store) => {
  const view = render(
    <JournalProvider store={target} now={now}>
      <SettingsScreen />
      <RevisionProbe />
    </JournalProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('data-import')).toBeTruthy());
  return view;
};

describe('stats section', () => {
  test('an empty journal invites you to start', async () => {
    await renderSettings();
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
    await renderSettings();
    await waitFor(() => expect(screen.getByText('Current streak: 3 days')).toBeTruthy());
    expect(screen.getByText('Longest streak: 3 days')).toBeTruthy();
    expect(screen.getByText('Total entries: 3')).toBeTruthy();
    expect(screen.getByText('Writing since: Mon 17 Aug 2026')).toBeTruthy();
  });

  // "Nothing crashes on a user's phone" - a rejecting store must reach the
  // user as a notification, not an unhandled rejection.
  test('a store failure surfaces as a notification rather than a crash', async () => {
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
    await renderSettings(broken);
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

  // ...and this pins that the SCREEN actually renders them in that order,
  // using the stats-line-<index> testIDs the screen already produces.
  test('the screen renders the lines in the order statsLines returns', async () => {
    await store.putAll(
      ['2026-08-17', '2026-08-18', '2026-08-19'].map((date) => ({
        date,
        body: 'x',
        created: `${date}T12:00:00Z`,
        updated: `${date}T12:00:00Z`,
      })),
    );
    await renderSettings();
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
});

describe('data section', () => {
  test('imports the chosen file and reports the result', async () => {
    pickCsv.mockResolvedValue({ name: 'journal.csv', text: CSV });
    await renderSettings();
    await act(async () => {
      fireEvent.press(screen.getByTestId('data-import'));
    });
    await waitFor(async () => {
      expect((await store.get('2026-08-19'))?.body).toBe('hello');
    });
    expect(notify).toHaveBeenCalledWith(
      'Import complete',
      'Imported 1. Skipped 0 existing. Failed 0.',
    );
    // Every other screen keys off `revision`; without this bump a successful
    // import leaves Write, Memories and Stats showing stale data on a device,
    // which no amount of testing THIS screen alone would reveal.
    expect(screen.getByTestId('revision').props.children).toBe('1');
  });

  // A cancelled picker is not an error and must produce no dialog at all.
  test('a cancelled picker is silent', async () => {
    pickCsv.mockResolvedValue(null);
    await renderSettings();
    await act(async () => {
      fireEvent.press(screen.getByTestId('data-import'));
    });
    expect(notify).not.toHaveBeenCalled();
  });

  test('overwrite is off by default and asks before arming', async () => {
    pickCsv.mockResolvedValue({ name: 'journal.csv', text: CSV });
    await renderSettings();
    expect(screen.getByTestId('data-overwrite').props.value).toBe(false);

    await fireEvent(screen.getByTestId('data-overwrite'), 'valueChange', true);
    await act(async () => {
      fireEvent.press(screen.getByTestId('data-import'));
    });
    expect(confirm).toHaveBeenCalledWith(
      'Overwrite existing entries?',
      'Entries in the file will replace entries you already have for the same dates. ' +
        'This cannot be undone.',
    );
  });

  // The flag's EFFECT, not just its confirmation dialog. Every other test in
  // this describe block imports a date that does not already exist, so
  // `overwrite` never changes the outcome - meaning a runImport that
  // hardcoded `false` would pass all of them. These two pin the flag end to
  // end, through the screen.
  test('with overwrite off, an existing date is left alone', async () => {
    await store.put({
      date: '2026-08-19',
      body: 'the original',
      created: '2020-01-01T00:00:00Z',
      updated: '2020-01-01T00:00:00Z',
    });
    pickCsv.mockResolvedValue({ name: 'journal.csv', text: CSV });
    await renderSettings();
    await act(async () => {
      fireEvent.press(screen.getByTestId('data-import'));
    });
    expect((await store.get('2026-08-19'))?.body).toBe('the original');
    expect(notify).toHaveBeenCalledWith(
      'Import complete',
      'Imported 0. Skipped 1 existing. Failed 0.',
    );
  });

  test('with overwrite on, an existing date is replaced', async () => {
    await store.put({
      date: '2026-08-19',
      body: 'the original',
      created: '2020-01-01T00:00:00Z',
      updated: '2020-01-01T00:00:00Z',
    });
    pickCsv.mockResolvedValue({ name: 'journal.csv', text: CSV });
    await renderSettings();
    await act(async () => {
      fireEvent(screen.getByTestId('data-overwrite'), 'valueChange', true);
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('data-import'));
    });
    expect((await store.get('2026-08-19'))?.body).toBe('hello');
    expect(notify).toHaveBeenCalledWith(
      'Import complete',
      'Imported 1. Skipped 0 existing. Failed 0.',
    );
  });

  test('declining the overwrite confirmation imports nothing', async () => {
    confirm.mockResolvedValue(false);
    pickCsv.mockResolvedValue({ name: 'journal.csv', text: CSV });
    await renderSettings();
    await fireEvent(screen.getByTestId('data-overwrite'), 'valueChange', true);
    await act(async () => {
      fireEvent.press(screen.getByTestId('data-import'));
    });
    expect(pickCsv).not.toHaveBeenCalled();
    await expect(store.dates()).resolves.toEqual([]);
  });

  // pickCsv used to sit outside the try/catch in runImport, invoked as `void
  // runImport()`: a rejecting document picker (or a stale/unreadable SAF
  // content URI) became an unhandled rejection with no dialog and no receipt.
  test('a rejecting picker is reported, not swallowed', async () => {
    pickCsv.mockRejectedValue(new Error('could not read that file'));
    await renderSettings();
    await act(async () => {
      fireEvent.press(screen.getByTestId('data-import'));
    });
    expect(notify).toHaveBeenCalledWith(
      'Could not import that file',
      'could not read that file',
    );
  });

  test('a file with a bad header is reported, not swallowed', async () => {
    pickCsv.mockResolvedValue({ name: 'wrong.csv', text: 'a,b\n1,2\n' });
    await renderSettings();
    await act(async () => {
      fireEvent.press(screen.getByTestId('data-import'));
    });
    expect(notify).toHaveBeenCalledWith(
      'Could not import that file',
      expect.stringMatching(/unknown column/),
    );
  });

  test('exports every entry under the dated filename', async () => {
    await store.put({
      date: '2026-08-19',
      body: 'hello',
      created: '2026-08-19T12:00:00Z',
      updated: '2026-08-19T12:00:00Z',
    });
    saveCsv.mockResolvedValue('remindiary-2026-08-19.csv');
    await renderSettings();
    await act(async () => {
      fireEvent.press(screen.getByTestId('data-export'));
    });
    expect(saveCsv).toHaveBeenCalledWith(
      'remindiary-2026-08-19.csv',
      'date,body,created,updated\n2026-08-19,hello,2026-08-19T12:00:00Z,2026-08-19T12:00:00Z\n',
    );
    expect(notify).toHaveBeenCalledWith(
      'Export complete',
      'Your journal has been written to remindiary-2026-08-19.csv.',
    );
  });

  // The import path already has an error test; this covers the export side,
  // where the failure comes from the STORE rather than the file.
  test('a failing store surfaces as a notification rather than a crash', async () => {
    const broken: Store = {
      get: store.get.bind(store),
      put: store.put.bind(store),
      putAll: store.putAll.bind(store),
      delete: store.delete.bind(store),
      onThisDay: store.onThisDay.bind(store),
      dates: store.dates.bind(store),
      all: () => {
        throw new Error('database is locked');
      },
      close: store.close.bind(store),
    };
    await renderSettings(broken);
    await act(async () => {
      fireEvent.press(screen.getByTestId('data-export'));
    });
    expect(notify).toHaveBeenCalledWith(
      'Could not export your journal',
      'database is locked',
    );
    expect(saveCsv).not.toHaveBeenCalled();
  });

  describe('formatImportResult', () => {
    test('reports the counts', () => {
      expect(
        formatImportResult({ imported: 3, skipped: 1, failed: 0, errors: [] }),
      ).toBe('Imported 3. Skipped 1 existing. Failed 0.');
    });

    test('quotes the failing rows', () => {
      expect(
        formatImportResult({
          imported: 0,
          skipped: 0,
          failed: 2,
          errors: [
            { row: 2, message: 'empty body' },
            { row: 5, message: 'invalid date "nope": want YYYY-MM-DD' },
          ],
        }),
      ).toBe(
        'Imported 0. Skipped 0 existing. Failed 2.\n' +
          'row 2: empty body\n' +
          'row 5: invalid date "nope": want YYYY-MM-DD',
      );
    });

    // A thoroughly broken file must not produce an unreadable wall of text.
    test('caps the quoted rows at five', () => {
      const errors = Array.from({ length: 8 }, (_, i) => ({
        row: i + 2,
        message: 'empty body',
      }));
      const text = formatImportResult({ imported: 0, skipped: 0, failed: 8, errors });
      expect(text.split('\n')).toHaveLength(7); // summary + 5 rows + the tail
      expect(text).toContain('…and 3 more.');
    });
  });
});
