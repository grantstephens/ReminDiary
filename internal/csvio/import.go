package csvio

import (
	"bufio"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"remindiary/internal/journal"
)

// bom is the UTF-8 byte order mark that spreadsheet exports often prepend.
const bom = "\ufeff"

// RowError records why one row of an import was rejected. Row is 1-based and
// counts the header, matching what a spreadsheet shows the user.
type RowError struct {
	Row int
	Err error
}

// Error implements error.
func (r RowError) Error() string { return fmt.Sprintf("row %d: %v", r.Row, r.Err) }

// Unwrap allows errors.Is and errors.As to see the underlying cause.
func (r RowError) Unwrap() error { return r.Err }

// ImportResult is the receipt shown to the user after an import.
type ImportResult struct {
	// Imported counts rows written to the store.
	Imported int
	// Skipped counts valid rows whose date already existed while overwrite was
	// off.
	Skipped int
	// Failed counts rows rejected by validation.
	Failed int
	// Errors holds one entry per failed row, in file order.
	Errors []RowError
}

// Import reads CSV from r and merges it into s.
//
// The whole file is parsed and validated before anything is written, and every
// accepted row is then applied in a single PutAll, so an import either lands
// completely or not at all. Rows that fail validation are counted and reported
// but do not abort the import.
//
// When overwrite is false, a row whose date already exists in s is skipped and
// the existing entry is left alone. When true, imported rows win.
//
// now supplies the created and updated timestamps for rows that omit them.
func Import(r io.Reader, s journal.Store, overwrite bool, now time.Time) (ImportResult, error) {
	var res ImportResult

	br := bufio.NewReader(r)
	if prefix, err := br.Peek(len(bom)); err == nil && string(prefix) == bom {
		if _, err := br.Discard(len(bom)); err != nil {
			return res, fmt.Errorf("discard byte order mark: %w", err)
		}
	}

	cr := csv.NewReader(br)
	// Field counts are validated per row so that one short row does not abort
	// the whole file.
	cr.FieldsPerRecord = -1

	head, err := cr.Read()
	if err == io.EOF {
		return res, errors.New("file is empty: expected a header row of date,body,created,updated")
	}
	if err != nil {
		return res, fmt.Errorf("read header: %w", err)
	}

	cols, err := indexHeader(head)
	if err != nil {
		return res, err
	}

	var (
		accepted []journal.Entry
		seen     = make(map[journal.Date]bool)
		row      = 1 // the header we just consumed
	)
	for {
		rec, err := cr.Read()
		if err == io.EOF {
			break
		}
		row++
		if err != nil {
			var parseErr *csv.ParseError
			if errors.As(err, &parseErr) {
				res.Failed++
				res.Errors = append(res.Errors, RowError{Row: row, Err: parseErr.Err})
				continue
			}
			return ImportResult{}, fmt.Errorf("read row %d: %w", row, err)
		}

		entry, err := parseRow(rec, cols, now)
		if err != nil {
			res.Failed++
			res.Errors = append(res.Errors, RowError{Row: row, Err: err})
			continue
		}
		if seen[entry.Date] {
			res.Failed++
			res.Errors = append(res.Errors, RowError{Row: row, Err: fmt.Errorf("duplicate date %s in this file", entry.Date)})
			continue
		}
		seen[entry.Date] = true
		accepted = append(accepted, entry)
	}

	existingDates, err := s.Dates()
	if err != nil {
		return ImportResult{}, fmt.Errorf("read existing dates: %w", err)
	}
	existing := make(map[journal.Date]bool, len(existingDates))
	for _, d := range existingDates {
		existing[d] = true
	}

	batch := make([]journal.Entry, 0, len(accepted))
	for _, e := range accepted {
		if existing[e.Date] && !overwrite {
			res.Skipped++
			continue
		}
		batch = append(batch, e)
	}

	if err := s.PutAll(batch); err != nil {
		return ImportResult{}, fmt.Errorf("write imported entries: %w", err)
	}
	res.Imported = len(batch)
	return res, nil
}

// columns maps each known column to its index in the file, or -1 when absent.
type columns struct {
	date    int
	body    int
	created int
	updated int
}

// indexHeader validates the header row and locates each column. Columns may
// appear in any order; date and body are required and unknown columns are
// rejected rather than silently ignored, so a mismatched file fails loudly
// instead of importing garbage.
func indexHeader(head []string) (columns, error) {
	cols := columns{date: -1, body: -1, created: -1, updated: -1}
	var unknown []string
	for i, raw := range head {
		switch strings.ToLower(strings.TrimSpace(raw)) {
		case "date":
			cols.date = i
		case "body":
			cols.body = i
		case "created":
			cols.created = i
		case "updated":
			cols.updated = i
		default:
			unknown = append(unknown, raw)
		}
	}
	if len(unknown) > 0 {
		return cols, fmt.Errorf("unknown column(s) %s: expected %s", strings.Join(unknown, ", "), strings.Join(header, ","))
	}
	if cols.date == -1 || cols.body == -1 {
		return cols, fmt.Errorf("header must contain date and body columns, got %s", strings.Join(head, ","))
	}
	return cols, nil
}

// parseRow validates one record and turns it into an entry.
func parseRow(rec []string, cols columns, now time.Time) (journal.Entry, error) {
	need := cols.date
	for _, i := range []int{cols.body, cols.created, cols.updated} {
		if i > need {
			need = i
		}
	}
	if len(rec) <= need {
		return journal.Entry{}, fmt.Errorf("expected %d fields, got %d", need+1, len(rec))
	}

	date, err := journal.ParseDate(strings.TrimSpace(rec[cols.date]))
	if err != nil {
		return journal.Entry{}, err
	}

	body := rec[cols.body]
	if strings.TrimSpace(body) == "" {
		return journal.Entry{}, errors.New("empty body")
	}

	created, err := parseStamp(rec, cols.created, now)
	if err != nil {
		return journal.Entry{}, fmt.Errorf("created: %w", err)
	}
	updated, err := parseStamp(rec, cols.updated, now)
	if err != nil {
		return journal.Entry{}, fmt.Errorf("updated: %w", err)
	}

	return journal.Entry{Date: date, Body: body, Created: created, Updated: updated}, nil
}

// parseStamp reads an optional timestamp column, falling back to now when the
// column is absent or blank.
func parseStamp(rec []string, idx int, now time.Time) (time.Time, error) {
	if idx == -1 {
		return now.UTC(), nil
	}
	raw := strings.TrimSpace(rec[idx])
	if raw == "" {
		return now.UTC(), nil
	}
	t, err := time.Parse(timeLayout, raw)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid timestamp %q: want RFC3339 such as 2026-08-19T18:42:00Z", raw)
	}
	return t.UTC(), nil
}
