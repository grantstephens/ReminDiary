import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { Text } from 'react-native';

import { JournalProvider, useJournal } from '../JournalContext';
import type { Store } from '../domain/store';
import { SqliteStore } from '../storage/SqliteStore';
import { openNodeSqlite } from '../storage/nodeSqlite';
import { DataScreen, formatImportResult } from './Data';

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
// screen queries that follow it. renderData waits for a stable element
// before returning, the same convention Write.test.tsx's renderWrite uses.
const renderData = async (target: Store = store) => {
  const view = render(
    <JournalProvider store={target} now={now}>
      <DataScreen />
      <RevisionProbe />
    </JournalProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('data-import')).toBeTruthy());
  return view;
};

test('imports the chosen file and reports the result', async () => {
  pickCsv.mockResolvedValue({ name: 'journal.csv', text: CSV });
  await renderData();
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
  await renderData();
  await act(async () => {
    fireEvent.press(screen.getByTestId('data-import'));
  });
  expect(notify).not.toHaveBeenCalled();
});

test('overwrite is off by default and asks before arming', async () => {
  pickCsv.mockResolvedValue({ name: 'journal.csv', text: CSV });
  await renderData();
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
// this file imports a date that does not already exist, so `overwrite` never
// changes the outcome - meaning a runImport that hardcoded `false` would pass
// all of them. These two pin the flag end to end, through the screen.
test('with overwrite off, an existing date is left alone', async () => {
  await store.put({
    date: '2026-08-19',
    body: 'the original',
    created: '2020-01-01T00:00:00Z',
    updated: '2020-01-01T00:00:00Z',
  });
  pickCsv.mockResolvedValue({ name: 'journal.csv', text: CSV });
  await renderData();
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
  await renderData();
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
  await renderData();
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
  await renderData();
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
  await renderData();
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
  await renderData();
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
  await renderData(broken);
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
