import { SqliteStore } from '../storage/SqliteStore';
import { openNodeSqlite } from '../storage/nodeSqlite';
import { formatRowError, importCsv } from './import';

const NOW = new Date('2026-08-19T12:00:00Z');
const newStore = () => SqliteStore.open(openNodeSqlite(':memory:'));
const HEADER = 'date,body,created,updated\n';

test('imports well-formed rows', async () => {
  const store = await newStore();
  const result = await importCsv(
    `${HEADER}2026-08-19,hello,2026-08-19T18:42:00Z,2026-08-19T18:42:00Z\n`,
    store,
    false,
    NOW,
  );
  expect(result).toEqual({ imported: 1, skipped: 0, failed: 0, errors: [] });
  await expect(store.get('2026-08-19')).resolves.toEqual({
    date: '2026-08-19',
    body: 'hello',
    created: '2026-08-19T18:42:00Z',
    updated: '2026-08-19T18:42:00Z',
  });
  await store.close();
});

test('fills missing timestamps with now', async () => {
  const store = await newStore();
  await importCsv('date,body\n2026-08-19,hello\n', store, false, NOW);
  await expect(store.get('2026-08-19')).resolves.toEqual({
    date: '2026-08-19',
    body: 'hello',
    created: '2026-08-19T12:00:00Z',
    updated: '2026-08-19T12:00:00Z',
  });
  await store.close();
});

test('accepts columns in any order', async () => {
  const store = await newStore();
  const result = await importCsv('body,date\nhello,2026-08-19\n', store, false, NOW);
  expect(result.imported).toBe(1);
  expect((await store.get('2026-08-19'))?.body).toBe('hello');
  await store.close();
});

test('strips a UTF-8 BOM', async () => {
  const store = await newStore();
  const result = await importCsv(`﻿${HEADER}2026-08-19,hello,,\n`, store, false, NOW);
  expect(result.imported).toBe(1);
  await store.close();
});

test('normalises a non-UTC timestamp and drops fractional seconds', async () => {
  const store = await newStore();
  await importCsv(
    `${HEADER}2026-08-19,hello,2026-08-19T19:42:00+01:00,2026-08-19T18:42:00.500Z\n`,
    store,
    false,
    NOW,
  );
  await expect(store.get('2026-08-19')).resolves.toMatchObject({
    created: '2026-08-19T18:42:00Z',
    updated: '2026-08-19T18:42:00Z',
  });
  await store.close();
});

describe('conflicts', () => {
  const existing = `${HEADER}2026-08-19,old,2020-01-01T00:00:00Z,2020-01-01T00:00:00Z\n`;
  const incoming = `${HEADER}2026-08-19,new,2021-01-01T00:00:00Z,2021-01-01T00:00:00Z\n`;

  test('skips an existing date by default', async () => {
    const store = await newStore();
    await importCsv(existing, store, false, NOW);
    const result = await importCsv(incoming, store, false, NOW);
    expect(result).toMatchObject({ imported: 0, skipped: 1, failed: 0 });
    expect((await store.get('2026-08-19'))?.body).toBe('old');
    await store.close();
  });

  test('overwrites when asked', async () => {
    const store = await newStore();
    await importCsv(existing, store, false, NOW);
    const result = await importCsv(incoming, store, true, NOW);
    expect(result).toMatchObject({ imported: 1, skipped: 0, failed: 0 });
    expect((await store.get('2026-08-19'))?.body).toBe('new');
    await store.close();
  });
});

describe('rejecting the file outright', () => {
  test.each([
    ['', /file is empty/],
    ['body\nhello\n', /must contain date and body/],
    ['date\n2026-08-19\n', /must contain date and body/],
    ['date,body,mood\n2026-08-19,hello,fine\n', /unknown column\(s\) mood/],
  ])('rejects %j', async (text, message) => {
    const store = await newStore();
    await expect(importCsv(text, store, false, NOW)).rejects.toThrow(message);
    await store.close();
  });
});

describe('rejecting individual rows', () => {
  test('reports each bad row by number and imports the rest', async () => {
    const store = await newStore();
    const text =
      HEADER +
      '2026-08-19,good,,\n' + // row 2 - fine
      '2026-8-9,unpadded date,,\n' + // row 3
      '2026-08-21,,,\n' + // row 4 - empty body
      '2026-08-22,ok,not-a-timestamp,\n' + // row 5
      '2026-08-23,ok,,\n' + // row 6 - fine
      '2026-08-19,duplicate in file,,\n'; // row 7
    const result = await importCsv(text, store, false, NOW);

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(4);
    expect(result.errors.map((e) => e.row)).toEqual([3, 4, 5, 7]);
    expect(result.errors[0]?.message).toMatch(/want YYYY-MM-DD/);
    expect(result.errors[1]?.message).toMatch(/empty body/);
    expect(result.errors[2]?.message).toMatch(/created: invalid timestamp/);
    expect(result.errors[3]?.message).toMatch(/duplicate date 2026-08-19 in this file/);
    await store.close();
  });

  test('reports a short row', async () => {
    const store = await newStore();
    const result = await importCsv(`${HEADER}2026-08-19\n`, store, false, NOW);
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.message).toMatch(/expected 4 fields, got 1/);
    await store.close();
  });

  test('a body of only whitespace counts as empty', async () => {
    const store = await newStore();
    const result = await importCsv(`${HEADER}2026-08-19,"   ",,\n`, store, false, NOW);
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.message).toBe('empty body');
    await store.close();
  });

  test('row numbers survive a multi-line body', async () => {
    const store = await newStore();
    const result = await importCsv(
      `${HEADER}2026-08-19,"one\ntwo\nthree",,\n2026-08-20,,,\n`,
      store,
      false,
      NOW,
    );
    expect(result.errors.map((e) => e.row)).toEqual([3]);
    await store.close();
  });
});

// Atomicity: a file where every row is bad must leave the store untouched.
test('nothing lands when every row is bad', async () => {
  const store = await newStore();
  const result = await importCsv(`${HEADER}nope,,,\nalso-nope,,,\n`, store, false, NOW);
  expect(result.imported).toBe(0);
  expect(result.failed).toBe(2);
  await expect(store.dates()).resolves.toEqual([]);
  await store.close();
});

test('formatRowError reads the way the Go app reports it', () => {
  expect(formatRowError({ row: 3, message: 'empty body' })).toBe('row 3: empty body');
});
