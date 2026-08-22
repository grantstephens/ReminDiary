import * as SQLite from 'expo-sqlite';

import type { SqlDatabase, SqlParam } from './sql';

/**
 * openExpoSqlite backs SqlDatabase with expo-sqlite, the native database.
 *
 * There is no test for this file: expo-sqlite has no Node build, so it can only
 * run on a device. Everything it is a seam for — every query, every ordering
 * guarantee, transactional putAll — is covered by the contract suite running
 * SqliteStore against node:sqlite. This adapter is four one-line delegations
 * precisely so that stays true.
 */
export async function openExpoSqlite(name: string): Promise<SqlDatabase> {
  const db = await SQLite.openDatabaseAsync(name);
  return {
    async exec(sql) {
      await db.execAsync(sql);
    },
    async run(sql, params: SqlParam[] = []) {
      await db.runAsync(sql, params);
    },
    async all<T>(sql: string, params: SqlParam[] = []) {
      return db.getAllAsync<T>(sql, params);
    },
    each<T>(sql: string, params: SqlParam[] = []) {
      return db.getEachAsync<T>(sql, params);
    },
    async close() {
      await db.closeAsync();
    },
  };
}
