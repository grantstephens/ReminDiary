import 'fake-indexeddb/auto';

import type { Entry } from '../domain/entry';
import { IndexedDbStore } from './IndexedDbStore';

const entry = (date: string): Entry => ({
  date,
  body: date,
  created: '2026-01-01T00:00:00Z',
  updated: '2026-01-01T00:00:00Z',
});

let counter = 0;
const newStore = () => IndexedDbStore.open(`atomicity-${counter++}`);

describe('IndexedDbStore.putAll atomicity', () => {
  test('leaves the store untouched when one entry in the batch is unwritable', async () => {
    const store = await newStore();
    await store.put(entry('2026-01-01'));

    // No `date`, so the object store's keyPath resolves to undefined and put()
    // throws DataError - synchronously, part-way through the batch.
    const unwritable = { body: 'no date', created: 'T', updated: 'T' } as unknown as Entry;

    await expect(store.putAll([entry('2026-02-02'), unwritable])).rejects.toThrow();

    // The valid entry was queued BEFORE the throw. If putAll did not abort the
    // transaction it would commit anyway and this would read three dates.
    await expect(store.dates()).resolves.toEqual(['2026-01-01']);

    await store.close();
  });

  test('a batch with no failures commits every entry', async () => {
    const store = await newStore();
    await store.putAll([entry('2026-01-01'), entry('2026-01-02')]);
    await expect(store.dates()).resolves.toEqual(['2026-01-01', '2026-01-02']);
    await store.close();
  });
});
