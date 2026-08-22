import type { JournalDate } from '../domain/date';
import type { Entry } from '../domain/entry';
import type { Store } from '../domain/store';
import type { SqlDatabase } from './sql';

/** The columns, in the one order every query in this file uses. */
const COLUMNS = 'date, body, created, updated';

const UPSERT = `
  INSERT INTO entries (date, body, created, updated)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(date) DO UPDATE SET
    body = excluded.body,
    created = excluded.created,
    updated = excluded.updated
`;

/** A row as SQLite hands it back, before it is trusted as an Entry. */
interface Row {
  date: string;
  body: string;
  created: string;
  updated: string;
}

function toEntry(row: Row): Entry {
  // Copied field by field rather than spread: node:sqlite returns
  // null-prototype objects, and this keeps a plain one crossing the boundary.
  return {
    date: row.date,
    body: row.body,
    created: row.created,
    updated: row.updated,
  };
}

/** twoDigit renders a 1-based month or day the way the date key stores it. */
function twoDigit(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * SqliteStore is the native Store, one row per entry keyed by ISO date.
 *
 * Every ordering guarantee falls out of the date key being fixed-width and
 * zero-padded: `ORDER BY date` is chronological with no secondary index, and
 * `substr(date, 6)` is the "MM-DD" suffix, which makes onThisDay an exact
 * string match — so 29 February can never bleed into 28 February.
 */
export class SqliteStore implements Store {
  private constructor(private readonly db: SqlDatabase) {}

  static async open(db: SqlDatabase): Promise<SqliteStore> {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        date    TEXT PRIMARY KEY NOT NULL,
        body    TEXT NOT NULL,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );
    `);
    return new SqliteStore(db);
  }

  async get(date: JournalDate): Promise<Entry | null> {
    const rows = await this.db.all<Row>(
      `SELECT ${COLUMNS} FROM entries WHERE date = ?`,
      [date],
    );
    return rows.length > 0 ? toEntry(rows[0]!) : null;
  }

  async put(e: Entry): Promise<void> {
    await this.db.run(UPSERT, [e.date, e.body, e.created, e.updated]);
  }

  async putAll(entries: Entry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.db.exec('BEGIN');
    try {
      for (const e of entries) {
        await this.db.run(UPSERT, [e.date, e.body, e.created, e.updated]);
      }
      await this.db.exec('COMMIT');
    } catch (err) {
      try {
        await this.db.exec('ROLLBACK');
      } catch {
        // SQLite auto-aborts the transaction on the severe error classes -
        // disk full, I/O error, out of memory, interrupt - and ROLLBACK then
        // throws "cannot rollback - no transaction is active". Letting that
        // escape would replace the real write failure with a confusing
        // secondary one, and a full disk mid-import on a phone is exactly
        // when the original error matters most.
      }
      throw err;
    }
  }

  async delete(date: JournalDate): Promise<void> {
    await this.db.run('DELETE FROM entries WHERE date = ?', [date]);
  }

  async onThisDay(month: number, day: number): Promise<Entry[]> {
    const suffix = `${twoDigit(month)}-${twoDigit(day)}`;
    const rows = await this.db.all<Row>(
      `SELECT ${COLUMNS} FROM entries WHERE substr(date, 6) = ? ORDER BY date DESC`,
      [suffix],
    );
    return rows.map(toEntry);
  }

  async dates(): Promise<JournalDate[]> {
    const rows = await this.db.all<{ date: string }>(
      'SELECT date FROM entries ORDER BY date ASC',
    );
    return rows.map((r) => r.date);
  }

  async *all(): AsyncIterable<Entry> {
    for await (const row of this.db.each<Row>(
      `SELECT ${COLUMNS} FROM entries ORDER BY date ASC`,
    )) {
      yield toEntry(row);
    }
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}
