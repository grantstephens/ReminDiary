import { Platform } from 'react-native';

import type { Store } from '../domain/store';
import { IndexedDbStore } from './IndexedDbStore';
import { SqliteStore } from './SqliteStore';
import { openExpoSqlite } from './expoSqlite';

/** The database name, on both platforms. */
const DATABASE = 'journal.db';

/**
 * openStore opens the right Store for the platform: SQLite on Android, where
 * expo-sqlite is mature and needs no special serving headers, and IndexedDB on
 * the web, where it needs neither WASM nor cross-origin isolation.
 */
export async function openStore(): Promise<Store> {
  if (Platform.OS === 'web') {
    return IndexedDbStore.open(DATABASE);
  }
  return SqliteStore.open(await openExpoSqlite(DATABASE));
}
