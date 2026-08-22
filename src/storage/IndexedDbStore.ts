import type { JournalDate } from '../domain/date';
import type { Entry } from '../domain/entry';
import type { Store } from '../domain/store';

const STORE = 'entries';

/** promisify turns one IDBRequest into a promise. */
function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/** done resolves when a transaction commits, or rejects if it does not. */
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function toEntry(value: Entry): Entry {
  return {
    date: value.date,
    body: value.body,
    created: value.created,
    updated: value.updated,
  };
}

/**
 * IndexedDbStore is the web Store: one object store keyed by ISO date.
 *
 * There is no secondary index. Every query this app makes is either a key
 * lookup or a full ordered walk, and IndexedDB walks a keyPath in ascending
 * key order — which, because the date key is fixed-width and zero-padded, is
 * chronological order. onThisDay filters that walk by the "MM-DD" suffix; for
 * a diary measured in thousands of entries that is far cheaper than the
 * migration risk of maintaining a derived index column.
 */
export class IndexedDbStore implements Store {
  private constructor(private readonly db: IDBDatabase) {}

  static open(name: string): Promise<IndexedDbStore> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'date' });
        }
      };
      request.onsuccess = () => resolve(new IndexedDbStore(request.result));
      request.onerror = () =>
        reject(request.error ?? new Error(`could not open the database "${name}"`));
      request.onblocked = () =>
        reject(new Error(`the database "${name}" is open in another tab`));
    });
  }

  async get(date: JournalDate): Promise<Entry | null> {
    const tx = this.db.transaction(STORE, 'readonly');
    const value = await promisify<Entry | undefined>(tx.objectStore(STORE).get(date));
    return value ? toEntry(value) : null;
  }

  async put(entry: Entry): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(toEntry(entry));
    await done(tx);
  }

  async putAll(entries: Entry[]): Promise<void> {
    if (entries.length === 0) return;
    // One transaction for the batch is what makes import all-or-nothing: if any
    // put fails the transaction aborts and none of them land.
    const tx = this.db.transaction(STORE, 'readwrite');
    const objects = tx.objectStore(STORE);
    try {
      for (const entry of entries) objects.put(toEntry(entry));
    } catch (err) {
      // put() throws SYNCHRONOUSLY on a malformed value - a missing keyPath,
      // an unstructured-cloneable field. Without this abort, the puts already
      // queued before the throw would still commit when the event loop next
      // runs dry, and a half-written batch is exactly what putAll promises
      // cannot happen.
      tx.abort();
      throw err;
    }
    await done(tx);
  }

  async delete(date: JournalDate): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(date);
    await done(tx);
  }

  async onThisDay(month: number, day: number): Promise<Entry[]> {
    const suffix = `-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const everything = await this.readAll();
    return everything.filter((e) => e.date.endsWith(suffix)).reverse();
  }

  async dates(): Promise<JournalDate[]> {
    const tx = this.db.transaction(STORE, 'readonly');
    const keys = await promisify<IDBValidKey[]>(tx.objectStore(STORE).getAllKeys());
    return keys as JournalDate[];
  }

  async *all(): AsyncIterable<Entry> {
    // Materialised rather than streamed from a cursor, deliberately. An
    // IndexedDB transaction auto-closes as soon as the event loop runs dry of
    // pending requests, so a cursor that yields control to a consumer between
    // rows has its transaction die under it. Reading the batch inside one
    // transaction and yielding from the array behaves identically from the
    // caller's side, including stopping early.
    for (const entry of await this.readAll()) {
      yield entry;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }

  /** readAll returns every entry in ascending date order. */
  private async readAll(): Promise<Entry[]> {
    const tx = this.db.transaction(STORE, 'readonly');
    const values = await promisify<Entry[]>(tx.objectStore(STORE).getAll());
    return values.map(toEntry);
  }
}
