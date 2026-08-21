import { parseDate } from '../domain/date';
import type { Entry } from '../domain/entry';
import { SqliteStore } from '../storage/SqliteStore';
import { openNodeSqlite } from '../storage/nodeSqlite';
import { exportCsv, exportFileName } from './export';

const entry = (date: string, body: string): Entry => ({
  date,
  body,
  created: '2026-08-19T18:42:00Z',
  updated: '2026-08-19T18:42:00Z',
});

const newStore = () => SqliteStore.open(openNodeSqlite(':memory:'));

test('an empty journal exports just the header', async () => {
  const store = await newStore();
  await expect(exportCsv(store)).resolves.toBe('date,body,created,updated\n');
  await store.close();
});

test('exports in ascending date order', async () => {
  const store = await newStore();
  await store.putAll([entry('2026-08-20', 'b'), entry('2026-08-19', 'a')]);
  await expect(exportCsv(store)).resolves.toBe(
    'date,body,created,updated\n' +
      '2026-08-19,a,2026-08-19T18:42:00Z,2026-08-19T18:42:00Z\n' +
      '2026-08-20,b,2026-08-19T18:42:00Z,2026-08-19T18:42:00Z\n',
  );
  await store.close();
});

// This is the exact shape the design spec puts on the page, and the exact
// shape the Go app writes.
test('quotes a body with commas and newlines the way the spec shows', async () => {
  const store = await newStore();
  await store.put(entry('2026-08-19', 'Multi-line bodies work fine,\nquotes and commas too'));
  await expect(exportCsv(store)).resolves.toBe(
    'date,body,created,updated\n' +
      '2026-08-19,"Multi-line bodies work fine,\nquotes and commas too",' +
      '2026-08-19T18:42:00Z,2026-08-19T18:42:00Z\n',
  );
  await store.close();
});

test('the offered filename names the day', () => {
  expect(exportFileName(parseDate('2026-08-19'))).toBe('remindiary-2026-08-19.csv');
});
