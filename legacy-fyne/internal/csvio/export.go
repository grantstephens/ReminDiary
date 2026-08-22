// Package csvio moves entries between a journal.Store and RFC 4180 CSV.
//
// The format is deliberately plain so that a spreadsheet can open it:
//
//	date,body,created,updated
//	2026-08-19,"body text",2026-08-19T18:42:00Z,2026-08-19T18:42:00Z
//
// Dates are ISO-8601 calendar dates; timestamps are RFC3339 in UTC.
package csvio

import (
	"encoding/csv"
	"fmt"
	"io"
	"time"

	"github.com/grantstephens/remindiary/internal/journal"
)

// header is the exact column order written on export and required on import.
var header = []string{"date", "body", "created", "updated"}

// timeLayout is the wire form for the created and updated columns.
const timeLayout = time.RFC3339

// Export writes every entry in s to w as CSV, in ascending date order.
func Export(w io.Writer, s journal.Store) error {
	cw := csv.NewWriter(w)
	if err := cw.Write(header); err != nil {
		return fmt.Errorf("write header: %w", err)
	}
	if err := s.All(func(e journal.Entry) error {
		return cw.Write([]string{
			e.Date.String(),
			e.Body,
			e.Created.UTC().Format(timeLayout),
			e.Updated.UTC().Format(timeLayout),
		})
	}); err != nil {
		return fmt.Errorf("write entries: %w", err)
	}
	cw.Flush()
	if err := cw.Error(); err != nil {
		return fmt.Errorf("flush: %w", err)
	}
	return nil
}
