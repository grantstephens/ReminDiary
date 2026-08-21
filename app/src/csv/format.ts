/**
 * RFC 4180 CSV, written and read exactly the way Go's encoding/csv does it.
 *
 * The Go app's export must be a valid import here, and this app's export must
 * be byte-identical to the Go app's. So these are not "a reasonable CSV writer"
 * and "a reasonable CSV reader" — they are a reimplementation of one specific
 * pair, quirks included.
 */

/**
 * Go quotes a field whose first rune is whitespace, using unicode.IsSpace.
 * JavaScript's \s is close but not equal: it omits U+0085 (NEL) and includes
 * U+FEFF, which unicode.IsSpace does not. This is Go's set, spelled out.
 */
const LEADING_SPACE = /^[\t\n\v\f\r \u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/;

/** A field containing any of these must be quoted. */
const NEEDS_QUOTES = /[",\r\n]/;

/**
 * quoteField renders one field the way Go's csv.Writer would.
 *
 * Note the asymmetry: LEADING whitespace forces quotes, trailing whitespace
 * does not, and an interior tab does not. The `\.` special case is Go's, kept
 * so that a file written here is byte-identical to one written there.
 */
export function quoteField(field: string): string {
  if (field === '') return '';
  if (field === '\\.' || NEEDS_QUOTES.test(field) || LEADING_SPACE.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/** writeRow renders one record, including its trailing LF. */
export function writeRow(fields: string[]): string {
  return `${fields.map(quoteField).join(',')}\n`;
}

/**
 * CsvRecord is one parsed record. Exactly one of fields and error is non-null.
 *
 * row is the 1-based record ordinal, counting the header — so a body containing
 * three newlines is still one row, and the number matches the gutter of a
 * spreadsheet rather than a line count in a text editor.
 */
export interface CsvRecord {
  row: number;
  fields: string[] | null;
  error: string | null;
}

const ERR_QUOTE = 'extraneous or missing " in quoted-field';
const ERR_BARE_QUOTE = 'bare " in non-quoted-field';

/**
 * parseCsv reads every record in text.
 *
 * A malformed record is reported in place and does not stop the parse, because
 * import must be able to report every bad row in a file at once rather than
 * making the user fix them one at a time.
 */
export function parseCsv(source: string): CsvRecord[] {
  // Go's Reader converts every \r\n in its input to a plain \n - including
  // inside quoted multiline field values, which its documentation calls out
  // explicitly - and drops a single trailing \r before EOF. Normalising once,
  // up front, lets everything below treat \n as the ONLY record terminator and
  // a lone \r as ordinary field content. That is precisely Go's model, and
  // getting it wrong is silent: a bare \r treated as a terminator splits one
  // record into two with no error reported at all.
  const text = source.replace(/\r\n/g, '\n').replace(/\r$/, '');

  const out: CsvRecord[] = [];
  const n = text.length;
  let i = 0;
  let row = 0;

  while (i < n) {
    // Go's reader skips truly blank lines and does not count them as records.
    if (text[i] === '\n') {
      i++;
      continue;
    }

    row++;
    const fields: string[] = [];
    let error: string | null = null;

    for (;;) {
      let field = '';

      if (text[i] === '"') {
        i++; // consume the opening quote
        for (;;) {
          if (i >= n) {
            error = ERR_QUOTE;
            break;
          }
          if (text[i] === '"') {
            if (text[i + 1] === '"') {
              field += '"';
              i += 2;
              continue;
            }
            i++; // consume the closing quote
            break;
          }
          field += text[i];
          i++;
        }
        if (error) break;
        // Only a delimiter or an end of record may follow a closing quote.
        if (i < n && text[i] !== ',' && text[i] !== '\n') {
          error = ERR_QUOTE;
          break;
        }
      } else {
        while (i < n && text[i] !== ',' && text[i] !== '\n') {
          if (text[i] === '"') {
            error = ERR_BARE_QUOTE;
            break;
          }
          field += text[i];
          i++;
        }
        if (error) break;
      }

      fields.push(field);
      if (i < n && text[i] === ',') {
        i++;
        continue;
      }
      break;
    }

    if (error) {
      // Resynchronise on the next line so one bad record cannot swallow the file.
      while (i < n && text[i] !== '\n') i++;
    }
    if (text[i] === '\n') i++;

    out.push(error ? { row, fields: null, error } : { row, fields, error: null });
  }

  return out;
}
