import { parseCsv, quoteField, writeRow } from './format';

describe('quoteField', () => {
  test.each([
    ['plain', 'plain'],
    ['has,comma', '"has,comma"'],
    ['has"quote', '"has""quote"'],
    ['has\nnewline', '"has\nnewline"'],
    ['has\rcr', '"has\rcr"'],
    [' leading space', '" leading space"'],
    ['trailing space ', 'trailing space '],
    ['a\tb', 'a\tb'],
    ['\tleading tab', '"\tleading tab"'],
    ['\u00A0nbsp-lead', '"\u00A0nbsp-lead"'],
    // These two are the ONLY cases that distinguish Go's unicode.White_Space
    // from JavaScript's \s, and they disagree in opposite directions. Without
    // both, swapping LEADING_SPACE for /^\s/ passes the entire suite.
    // U+0085 NEL: in Go's set, NOT in JS \s - so it must be quoted.
    ['\u0085leads', '"\u0085leads"'],
    // U+FEFF: in JS \s, NOT in Go's set - so it must NOT be quoted.
    ['\uFEFFleads', '\uFEFFleads'],
    ['', ''],
    ['\\.', '"\\."'],
    ['unicode e-acute é and a seedling \u{1F331}', 'unicode e-acute é and a seedling \u{1F331}'],
    ['"', '""""'],
    ['a"b"c', '"a""b""c"'],
  ])('quotes %j as %j', (input, want) => {
    expect(quoteField(input)).toBe(want);
  });
});

describe('writeRow', () => {
  test('joins with commas and ends with LF, never CRLF', () => {
    expect(writeRow(['date', 'body', 'created', 'updated'])).toBe(
      'date,body,created,updated\n',
    );
  });

  test('quotes only the fields that need it', () => {
    expect(writeRow(['2026-08-19', 'a, b', 'x'])).toBe('2026-08-19,"a, b",x\n');
  });
});

describe('parseCsv', () => {
  const fieldsOf = (text: string) => parseCsv(text).map((r) => r.fields);

  test('reads a plain file', () => {
    expect(fieldsOf('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  test('tolerates a missing final newline', () => {
    expect(fieldsOf('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  test('accepts CRLF line endings', () => {
    expect(fieldsOf('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  test('unwraps quoted fields and doubled quotes', () => {
    expect(fieldsOf('"a,b","he said ""hi"""\n')).toEqual([['a,b', 'he said "hi"']]);
  });

  test('keeps newlines inside a quoted field', () => {
    expect(fieldsOf('"line one\nline two",x\n')).toEqual([['line one\nline two', 'x']]);
  });

  test('keeps empty fields', () => {
    expect(fieldsOf('a,,c\n')).toEqual([['a', '', 'c']]);
    expect(fieldsOf('"",x\n')).toEqual([['', 'x']]);
  });

  // A record spanning three physical lines is still ONE record. Row numbers
  // count records, which is what a spreadsheet shows the user in its gutter.
  test('numbers records, not physical lines', () => {
    const records = parseCsv('date,body\n2026-08-19,"one\ntwo\nthree"\n2026-08-20,x\n');
    expect(records.map((r) => r.row)).toEqual([1, 2, 3]);
    expect(records[2]?.fields).toEqual(['2026-08-20', 'x']);
  });

  test('skips truly blank lines without counting them', () => {
    const records = parseCsv('a,b\n\n1,2\n\n');
    expect(records.map((r) => r.row)).toEqual([1, 2]);
    expect(records.map((r) => r.fields)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  test('reports a bare quote in an unquoted field', () => {
    const records = parseCsv('a,b\nbad"field,x\ngood,y\n');
    expect(records[1]?.fields).toBeNull();
    expect(records[1]?.error).toMatch(/bare "/);
    // A bad record must not derail the rest of the file.
    expect(records[2]?.fields).toEqual(['good', 'y']);
  });

  test('reports an unterminated quoted field', () => {
    const records = parseCsv('a,b\n"never closed,x\n');
    expect(records[1]?.fields).toBeNull();
    expect(records[1]?.error).toMatch(/extraneous or missing "/);
  });

  test('reports junk after a closing quote', () => {
    const records = parseCsv('a,b\n"closed"junk,x\n');
    expect(records[1]?.fields).toBeNull();
    expect(records[1]?.error).toMatch(/extraneous or missing "/);
  });

  test('an empty string parses to no records', () => {
    expect(parseCsv('')).toEqual([]);
  });

  // Go's reader ends a record only at \n (or \r\n). A lone \r anywhere else
  // is ordinary data. Treating it as a terminator splits one record into two
  // and reports no error at all - the worst failure mode a parser has, because
  // nothing downstream can tell it happened.
  test('a lone carriage return is field content, not a terminator', () => {
    expect(fieldsOf('abc\rdef,ghi\n')).toEqual([['abc\rdef', 'ghi']]);
  });

  // encoding/csv's documentation: "The Reader converts all \r\n sequences in
  // its input to plain \n, including in multiline field values."
  test('CRLF inside a quoted field is normalised to LF', () => {
    expect(fieldsOf('"line1\r\nline2",x\n')).toEqual([['line1\nline2', 'x']]);
  });

  test('a trailing carriage return before EOF is dropped', () => {
    expect(fieldsOf('a,b\r')).toEqual([['a', 'b']]);
  });
});

describe('writeRow and parseCsv are inverses', () => {
  test.each([
    ['plain', 'fields'],
    ['a,b', 'c"d'],
    ['line one\nline two', 'trailing space '],
    [' leading space', ''],
    ['\\.', 'unicode é \u{1F331}'],
    ['\tleading tab', 'a\tb'],
    // A lone \r survives a round trip: the writer quotes it, the reader
    // keeps it. A \r\n would NOT - the reader normalises it to \n - but
    // that is Go's behaviour too, so it is correct rather than a defect.
    ['has\rcarriage return', 'plain'],
  ])('round-trips %j, %j', (a, b) => {
    expect(parseCsv(writeRow([a, b]))[0]?.fields).toEqual([a, b]);
  });
});
