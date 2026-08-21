import 'fake-indexeddb/auto';

import type { Entry } from '../domain/entry';
import type { Store } from '../domain/store';
import { IndexedDbStore } from '../storage/IndexedDbStore';
import { SqliteStore } from '../storage/SqliteStore';
import { openNodeSqlite } from '../storage/nodeSqlite';
import { exportCsv } from './export';
import { importCsv } from './import';

const NOW = new Date('2026-08-19T12:00:00Z');

// created and updated deliberately differ, so a round trip that transposed the
// two columns would still fail rather than cancelling itself out.
const entry = (date: string, body: string): Entry => ({
  date,
  body,
  created: `${date}T08:00:00Z`,
  updated: `${date}T19:30:00Z`,
});

/** Every field shape that has ever broken a CSV implementation. */
const AWKWARD: Entry[] = [
  entry('2019-03-02', 'plain'),
  entry('2020-02-29', 'leap day, with a comma'),
  entry('2021-12-31', 'he said "hello"'),
  entry('2022-01-01', 'line one\nline two\nline three'),
  entry('2023-06-15', ' leading space'),
  entry('2024-07-04', 'trailing space '),
  entry('2025-08-19', 'unicode é \u{1F331} and a\ttab'),
  entry('2026-08-19', '\\.'),
];

let dbCounter = 0;
const backends: [string, () => Promise<Store>][] = [
  ['SqliteStore', () => SqliteStore.open(openNodeSqlite(':memory:'))],
  ['IndexedDbStore', () => IndexedDbStore.open(`roundtrip-${dbCounter++}`)],
];

describe.each(backends)('round trip through %s', (_name, newStore) => {
  test('export, import into an empty store, export again is byte-identical', async () => {
    const source = await newStore();
    await source.putAll(AWKWARD);
    const first = await exportCsv(source);

    const destination = await newStore();
    const result = await importCsv(first, destination, false, NOW);
    expect(result).toMatchObject({ imported: AWKWARD.length, skipped: 0, failed: 0 });

    const second = await exportCsv(destination);
    expect(second).toBe(first);

    await source.close();
    await destination.close();
  });
});
