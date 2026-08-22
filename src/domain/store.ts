import type { JournalDate } from './date';
import type { Entry } from './entry';

/**
 * Store persists entries, keyed by calendar date.
 *
 * Every method rejects with an Error rather than throwing synchronously or
 * crashing, because a failure on a user's phone must become an alert, not a
 * dead app.
 *
 * Implementations are driven from the UI thread and need not be safe against
 * concurrent callers — but note that "single-threaded" does not mean
 * "uninterleaved" in JavaScript the way it does for the Go original's single
 * goroutine: two overlapping awaits on the same store genuinely interleave.
 * Implementations must therefore keep each method's own writes atomic
 * (see putAll) rather than assuming no other call is in flight.
 */
export interface Store {
  /** get returns the entry for date, or null. A missing entry is not an error. */
  get(date: JournalDate): Promise<Entry | null>;

  /** put writes entry, replacing any existing entry for the same date. */
  put(entry: Entry): Promise<void>;

  /**
   * putAll writes every entry atomically: either all of them land or, if the
   * write fails, none do. It is what makes CSV import all-or-nothing.
   * An empty array is a no-op, not an error.
   */
  putAll(entries: Entry[]): Promise<void>;

  /**
   * delete removes the entry for date. Deleting a date that has no entry is
   * not an error.
   */
  delete(date: JournalDate): Promise<void>;

  /**
   * onThisDay returns every entry falling on the given 1-based month and day,
   * in any year present, ordered newest year first. It includes the current
   * year if an entry exists; filtering that out is the Memories screen's job.
   */
  onThisDay(month: number, day: number): Promise<Entry[]>;

  /** dates returns every date that has an entry, in ascending order. */
  dates(): Promise<JournalDate[]>;

  /**
   * all yields every entry in ascending date order. A consumer that stops
   * iterating (break, throw, or an early return) stops the underlying read.
   */
  all(): AsyncIterable<Entry>;

  /** close releases the underlying resources. */
  close(): Promise<void>;
}
