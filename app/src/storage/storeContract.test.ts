import { runStoreContract } from './storeContract';
import { SqliteStore } from './SqliteStore';
import { openNodeSqlite } from './nodeSqlite';

// Task 5 adds a second runStoreContract call here for IndexedDbStore. Two
// implementations, one suite — that is the point.
runStoreContract('SqliteStore', async () => SqliteStore.open(openNodeSqlite(':memory:')));
