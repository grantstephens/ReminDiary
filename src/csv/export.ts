import type { JournalDate } from '../domain/date';
import type { Store } from '../domain/store';
import { writeRow } from './format';

/** The exact column order written on export and required on import. */
export const CSV_HEADER = ['date', 'body', 'created', 'updated'];

/**
 * exportCsv renders every entry in store as CSV, in ascending date order.
 *
 * It returns a string rather than writing to a file, because "a file" means
 * two different things across Android and the browser. The platform writers in
 * src/platform own that difference; this owns the bytes. It is also the same
 * discipline as the Go app's rule about never assuming a real filesystem path
 * exists, for the same reason: on one of the two targets, it does not.
 */
export async function exportCsv(store: Store): Promise<string> {
  let out = writeRow(CSV_HEADER);
  for await (const e of store.all()) {
    out += writeRow([e.date, e.body, e.created, e.updated]);
  }
  return out;
}

/** exportFileName is the name offered in the save or share sheet. */
export function exportFileName(today: JournalDate): string {
  return `remindiary-${today}.csv`;
}
