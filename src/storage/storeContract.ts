import type { Entry } from '../domain/entry';
import type { JournalDate } from '../domain/date';
import type { Store } from '../domain/store';

const TS = '2026-08-19T12:00:00Z';

function entry(date: JournalDate, body: string): Entry {
  return { date, body, created: TS, updated: TS };
}

async function collect(store: Store): Promise<Entry[]> {
  const out: Entry[] = [];
  for await (const e of store.all()) out.push(e);
  return out;
}

/**
 * runStoreContract executes the full behavioural contract against stores
 * produced by newStore. Each test gets a fresh, empty store.
 */
export function runStoreContract(name: string, newStore: () => Promise<Store>): void {
  describe(name, () => {
    let store: Store;

    beforeEach(async () => {
      store = await newStore();
    });

    afterEach(async () => {
      await store.close();
    });

    test('get returns null for a missing date', async () => {
      await expect(store.get('2026-08-19')).resolves.toBeNull();
    });

    test('put then get round-trips every field', async () => {
      const want = entry('2026-08-19', 'hello');
      await store.put(want);
      await expect(store.get('2026-08-19')).resolves.toEqual(want);
    });

    test('put replaces rather than duplicating', async () => {
      await store.put(entry('2026-08-19', 'first'));
      await store.put(entry('2026-08-19', 'second'));
      expect((await store.get('2026-08-19'))?.body).toBe('second');
      await expect(store.dates()).resolves.toEqual(['2026-08-19']);
    });

    test('a body with newlines, quotes and unicode survives storage', async () => {
      const body = 'line one\nline two "quoted", with a comma — and an em dash 🌱';
      await store.put(entry('2026-08-19', body));
      expect((await store.get('2026-08-19'))?.body).toBe(body);
    });

    test('delete removes the entry', async () => {
      await store.put(entry('2026-08-19', 'hello'));
      await store.delete('2026-08-19');
      await expect(store.get('2026-08-19')).resolves.toBeNull();
    });

    test('deleting a date with no entry is not an error', async () => {
      await expect(store.delete('2026-08-19')).resolves.toBeUndefined();
    });

    test('dates come back ascending', async () => {
      for (const d of ['2026-01-10', '2025-12-31', '2026-01-09']) {
        await store.put(entry(d, 'x'));
      }
      await expect(store.dates()).resolves.toEqual([
        '2025-12-31',
        '2026-01-09',
        '2026-01-10',
      ]);
    });

    test('dates is empty for an empty store', async () => {
      await expect(store.dates()).resolves.toEqual([]);
    });

    test('all yields ascending', async () => {
      for (const d of ['2026-01-10', '2025-12-31']) await store.put(entry(d, d));
      const seen = await collect(store);
      expect(seen.map((e) => e.date)).toEqual(['2025-12-31', '2026-01-10']);
    });

    test('all is empty for an empty store', async () => {
      await expect(collect(store)).resolves.toEqual([]);
    });

    // The Go version's yield-error short-circuit, expressed the way an
    // AsyncIterable expresses it: breaking out must not leave a read running
    // or a transaction dangling, and must not throw.
    test('all stops when the consumer stops', async () => {
      for (const d of ['2026-01-01', '2026-01-02', '2026-01-03']) {
        await store.put(entry(d, d));
      }
      const seen: JournalDate[] = [];
      for await (const e of store.all()) {
        seen.push(e.date);
        break;
      }
      expect(seen).toEqual(['2026-01-01']);
      // The store is still usable afterwards.
      await expect(store.dates()).resolves.toHaveLength(3);
    });

    test('onThisDay returns every year, newest first', async () => {
      for (const d of [
        '2018-08-19',
        '2026-08-19',
        '2022-08-19',
        '2022-08-18',
        '2022-09-19',
      ]) {
        await store.put(entry(d, d));
      }
      const got = await store.onThisDay(8, 19);
      expect(got.map((e) => e.date)).toEqual(['2026-08-19', '2022-08-19', '2018-08-19']);
    });

    test('onThisDay matches a leap day exactly', async () => {
      await store.put(entry('2024-02-29', 'leap'));
      await store.put(entry('2023-02-28', 'not leap'));
      const got = await store.onThisDay(2, 29);
      expect(got.map((e) => e.date)).toEqual(['2024-02-29']);
    });

    test('onThisDay is empty when nothing matches', async () => {
      await expect(store.onThisDay(8, 19)).resolves.toEqual([]);
    });

    test('putAll writes everything', async () => {
      await store.putAll([
        entry('2026-08-19', 'a'),
        entry('2026-08-20', 'b'),
        entry('2026-08-21', 'c'),
      ]);
      await expect(store.dates()).resolves.toHaveLength(3);
    });

    test('putAll of nothing is a no-op', async () => {
      await store.putAll([]);
      await expect(store.dates()).resolves.toEqual([]);
    });

    test('putAll overwrites existing dates', async () => {
      await store.put(entry('2026-08-19', 'old'));
      await store.putAll([entry('2026-08-19', 'new')]);
      expect((await store.get('2026-08-19'))?.body).toBe('new');
    });
  });
}
