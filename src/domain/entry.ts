import type { JournalDate } from './date';

/**
 * Entry is one day's diary entry. Exactly one Entry may exist per date.
 *
 * created is set once, when the entry is first written, and preserved by later
 * edits. updated is set on every write. Both are RFC3339 UTC strings with no
 * fractional seconds — see toRfc3339Utc — because that is the CSV wire form,
 * and storing anything else would mean converting on every read and write.
 */
export interface Entry {
  date: JournalDate;
  body: string;
  created: string;
  updated: string;
}
