import {
  parseRfc3339,
  toRfc3339Utc,
  tryParseDate,
  type JournalDate,
} from '../domain/date';
import type { Entry } from '../domain/entry';
import type { Store } from '../domain/store';
import { CSV_HEADER } from './export';
import { parseCsv } from './format';

/** The UTF-8 byte order mark that spreadsheet exports often prepend. */
const BOM = '﻿';

/**
 * RowError records why one row was rejected. row is 1-based and counts the
 * header, matching what a spreadsheet shows the user.
 */
export interface RowError {
  row: number;
  message: string;
}

/** ImportResult is the receipt shown to the user after an import. */
export interface ImportResult {
  /** imported counts rows written to the store. */
  imported: number;
  /** skipped counts valid rows whose date existed while overwrite was off. */
  skipped: number;
  /** failed counts rows rejected by validation. */
  failed: number;
  /** errors holds one entry per failed row, in file order. */
  errors: RowError[];
}

/** formatRowError renders one error the way the Go app's RowError.Error does. */
export function formatRowError(e: RowError): string {
  return `row ${e.row}: ${e.message}`;
}

/** Which file column each known field lives in, or -1 when absent. */
interface Columns {
  date: number;
  body: number;
  created: number;
  updated: number;
}

/**
 * indexHeader validates the header row and locates each column.
 *
 * Columns may appear in any order. date and body are required. Unknown columns
 * are rejected by name rather than silently ignored, so pointing the importer
 * at the wrong file fails loudly instead of importing garbage.
 */
function indexHeader(head: string[]): Columns {
  const cols: Columns = { date: -1, body: -1, created: -1, updated: -1 };
  const unknown: string[] = [];

  head.forEach((raw, i) => {
    switch (raw.trim().toLowerCase()) {
      case 'date':
        cols.date = i;
        break;
      case 'body':
        cols.body = i;
        break;
      case 'created':
        cols.created = i;
        break;
      case 'updated':
        cols.updated = i;
        break;
      default:
        unknown.push(raw);
    }
  });

  if (unknown.length > 0) {
    throw new Error(
      `unknown column(s) ${unknown.join(', ')}: expected ${CSV_HEADER.join(',')}`,
    );
  }
  if (cols.date === -1 || cols.body === -1) {
    throw new Error(`header must contain date and body columns, got ${head.join(',')}`);
  }
  return cols;
}

/** parseStamp reads an optional timestamp column, falling back to now. */
function parseStamp(fields: string[], index: number, now: string): string {
  if (index === -1) return now;
  const raw = (fields[index] ?? '').trim();
  if (raw === '') return now;
  const parsed = parseRfc3339(raw);
  if (parsed === null) {
    throw new Error(
      `invalid timestamp "${raw}": want RFC3339 such as 2026-08-19T18:42:00Z`,
    );
  }
  return parsed;
}

/** parseRow validates one record and turns it into an entry, or throws. */
function parseRow(fields: string[], cols: Columns, now: string): Entry {
  const need = Math.max(cols.date, cols.body, cols.created, cols.updated);
  if (fields.length <= need) {
    throw new Error(`expected ${need + 1} fields, got ${fields.length}`);
  }

  const rawDate = (fields[cols.date] ?? '').trim();
  const date = tryParseDate(rawDate);
  if (date === null) {
    throw new Error(`invalid date "${rawDate}": want YYYY-MM-DD`);
  }

  const body = fields[cols.body] ?? '';
  if (body.trim() === '') {
    throw new Error('empty body');
  }

  let created: string;
  let updated: string;
  try {
    created = parseStamp(fields, cols.created, now);
  } catch (err) {
    throw new Error(`created: ${(err as Error).message}`);
  }
  try {
    updated = parseStamp(fields, cols.updated, now);
  } catch (err) {
    throw new Error(`updated: ${(err as Error).message}`);
  }

  return { date, body, created, updated };
}

/**
 * importCsv merges CSV text into store.
 *
 * The whole file is parsed and validated before anything is written, and every
 * accepted row is applied in a single putAll, so an import either lands
 * completely or not at all. Rows that fail validation are counted and reported
 * but never abort the import: one typo should not cost the other 3,650 days.
 *
 * When overwrite is false, a row whose date already exists is skipped and the
 * existing entry left alone. When true, imported rows win.
 *
 * Rejects only when the file as a whole is unusable: empty, or with a header
 * that is not this format.
 */
export async function importCsv(
  text: string,
  store: Store,
  overwrite: boolean,
  now: Date,
): Promise<ImportResult> {
  const body = text.startsWith(BOM) ? text.slice(BOM.length) : text;
  const records = parseCsv(body);

  const head = records[0];
  if (head === undefined) {
    throw new Error('file is empty: expected a header row of date,body,created,updated');
  }
  if (head.fields === null) {
    throw new Error(`could not read the header row: ${head.error}`);
  }
  const cols = indexHeader(head.fields);

  const stamp = toRfc3339Utc(now);
  const accepted: Entry[] = [];
  const seen = new Set<JournalDate>();
  const errors: RowError[] = [];

  for (const record of records.slice(1)) {
    if (record.fields === null) {
      errors.push({ row: record.row, message: record.error ?? 'could not be read' });
      continue;
    }
    let entry: Entry;
    try {
      entry = parseRow(record.fields, cols, stamp);
    } catch (err) {
      errors.push({ row: record.row, message: (err as Error).message });
      continue;
    }
    if (seen.has(entry.date)) {
      errors.push({
        row: record.row,
        message: `duplicate date ${entry.date} in this file`,
      });
      continue;
    }
    seen.add(entry.date);
    accepted.push(entry);
  }

  const existing = new Set(await store.dates());
  const batch: Entry[] = [];
  let skipped = 0;
  for (const entry of accepted) {
    if (existing.has(entry.date) && !overwrite) {
      skipped++;
      continue;
    }
    batch.push(entry);
  }

  await store.putAll(batch);

  return { imported: batch.length, skipped, failed: errors.length, errors };
}
