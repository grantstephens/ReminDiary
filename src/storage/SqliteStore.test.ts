import type { Entry } from '../domain/entry';
import type { SqlDatabase } from './sql';
import { SqliteStore } from './SqliteStore';

const ROWS = [
  { date: '2026-01-01', body: 'a', created: 'T', updated: 'T' },
  { date: '2026-01-02', body: 'b', created: 'T', updated: 'T' },
];

const entry = (date: string): Entry => ({ date, body: date, created: 'T', updated: 'T' });

interface FakeOptions {
  /** 1-based index of the run() call that should throw. */
  failRunOnCall?: number;
  /** Make ROLLBACK itself throw, as SQLite does after an auto-abort. */
  failRollback?: boolean;
}

/**
 * A SqlDatabase that fails where a real one only fails on a broken device.
 * It records what it was asked to do so the transaction shape can be asserted.
 */
class FakeSqlDatabase implements SqlDatabase {
  readonly calls: string[] = [];
  cursorClosed = false;
  yielded = 0;
  private runs = 0;

  constructor(private readonly opts: FakeOptions = {}) {}

  async exec(sql: string): Promise<void> {
    const verb = sql.trim().split(/\s+/)[0]!.toUpperCase();
    this.calls.push(verb);
    if (this.opts.failRollback && verb === 'ROLLBACK') {
      throw new Error('cannot rollback - no transaction is active');
    }
  }

  async run(): Promise<void> {
    this.runs++;
    this.calls.push('RUN');
    if (this.opts.failRunOnCall === this.runs) {
      throw new Error('disk I/O error');
    }
  }

  async all<T>(): Promise<T[]> {
    return [];
  }

  async *each<T>(): AsyncIterable<T> {
    try {
      for (const row of ROWS) {
        this.yielded++;
        yield row as T;
      }
    } finally {
      this.cursorClosed = true;
    }
  }

  async close(): Promise<void> {
    this.calls.push('CLOSE');
  }
}

describe('SqliteStore.putAll atomicity', () => {
  test('rolls back and does not commit when a write fails mid-batch', async () => {
    const db = new FakeSqlDatabase({ failRunOnCall: 2 });
    const store = await SqliteStore.open(db);

    await expect(
      store.putAll([entry('2026-01-01'), entry('2026-01-02'), entry('2026-01-03')]),
    ).rejects.toThrow('disk I/O error');

    // The contract's own putAll tests all pass against an implementation with
    // no transaction at all. These assertions are what actually pin it.
    expect(db.calls).toContain('BEGIN');
    expect(db.calls).toContain('ROLLBACK');
    expect(db.calls).not.toContain('COMMIT');
  });

  test('a failing ROLLBACK does not mask the original error', async () => {
    // SQLite auto-aborts the transaction on disk-full and I/O errors, after
    // which ROLLBACK throws. The caller must still see the write failure.
    const db = new FakeSqlDatabase({ failRunOnCall: 1, failRollback: true });
    const store = await SqliteStore.open(db);

    await expect(store.putAll([entry('2026-01-01')])).rejects.toThrow('disk I/O error');
  });

  test('an empty batch opens no transaction at all', async () => {
    const db = new FakeSqlDatabase();
    const store = await SqliteStore.open(db);
    await store.putAll([]);
    expect(db.calls).not.toContain('BEGIN');
  });
});

describe('SqliteStore.all', () => {
  test('stops reading and closes the cursor when the consumer breaks', async () => {
    const db = new FakeSqlDatabase();
    const store = await SqliteStore.open(db);

    for await (const _ of store.all()) {
      break;
    }

    // yielded === 1 is the falsifiable half: an implementation that buffered
    // every row before yielding the first would report 2 here. cursorClosed
    // catches a generator that never propagates the close inward.
    expect(db.yielded).toBe(1);
    expect(db.cursorClosed).toBe(true);
  });
});
