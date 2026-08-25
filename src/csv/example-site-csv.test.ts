import { readFileSync } from 'fs';
import { join } from 'path';

import { SqliteStore } from '../storage/SqliteStore';
import { openNodeSqlite } from '../storage/nodeSqlite';
import { importCsv } from './import';

/**
 * The example CSV linked from the app's own Import help text
 * (site/import/) is a real, user-facing teaching document. If it stops
 * being importable, the help page actively misleads people - so this
 * pins it against the real parser, not just "looks right on inspection".
 */
const EXAMPLE_CSV_PATH = join(__dirname, '../../site/import/example.csv');

test('the site example.csv is fully importable with zero failures', async () => {
  const csv = readFileSync(EXAMPLE_CSV_PATH, 'utf8');
  const store = await SqliteStore.open(openNodeSqlite(':memory:'));

  const result = await importCsv(csv, store, false, new Date('2024-06-01T00:00:00Z'));

  expect(result.failed).toBe(0);
  expect(result.errors).toEqual([]);
  expect(result.imported).toBe(3);

  // The comma- and quote-containing rows must round-trip with their real
  // content intact, not truncated or mis-split by the comma/quote.
  await expect(store.get('2024-01-16')).resolves.toMatchObject({
    body: 'Coffee, then a long walk. Simple day, good day.',
  });
  await expect(store.get('2024-01-17')).resolves.toMatchObject({
    body: 'Rain all day. Stayed in and read. Quote of the day: "Every day is a good day."',
  });

  await store.close();
});
