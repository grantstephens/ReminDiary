import { DatabaseSync } from 'node:sqlite';

import type { SqlDatabase, SqlParam } from './sql';

/**
 * openNodeSqlite backs SqlDatabase with Node's built-in SQLite.
 *
 * Tests only — nothing in the shipped app imports it. It exists so the store
 * contract runs against real SQLite rather than a mock. Node's built-in module
 * means no native build step and no extra dependency.
 */
export function openNodeSqlite(path = ':memory:'): SqlDatabase {
  const db = new DatabaseSync(path);
  return {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params: SqlParam[] = []) {
      db.prepare(sql).run(...params);
    },
    async all<T>(sql: string, params: SqlParam[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async *each<T>(sql: string, params: SqlParam[] = []) {
      for (const row of db.prepare(sql).iterate(...params)) {
        yield row as T;
      }
    },
    async close() {
      db.close();
    },
  };
}
