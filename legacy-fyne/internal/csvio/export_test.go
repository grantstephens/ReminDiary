package csvio_test

import (
	"bytes"
	"strings"
	"testing"
	"time"

	"github.com/grantstephens/remindiary/internal/csvio"
	"github.com/grantstephens/remindiary/internal/journal"
	"github.com/grantstephens/remindiary/internal/memstore"
)

func TestExportEmptyStoreWritesHeaderOnly(t *testing.T) {
	var buf bytes.Buffer
	if err := csvio.Export(&buf, memstore.New()); err != nil {
		t.Fatalf("Export: %v", err)
	}
	if got, want := buf.String(), "date,body,created,updated\n"; got != want {
		t.Fatalf("Export = %q, want %q", got, want)
	}
}

func TestExportWritesEntriesChronologically(t *testing.T) {
	s := memstore.New()
	ts := time.Date(2026, 8, 19, 18, 42, 0, 0, time.UTC)
	for _, d := range []journal.Date{"2026-08-20", "2026-08-19"} {
		if err := s.Put(journal.Entry{Date: d, Body: "body " + string(d), Created: ts, Updated: ts}); err != nil {
			t.Fatalf("Put: %v", err)
		}
	}

	var buf bytes.Buffer
	if err := csvio.Export(&buf, s); err != nil {
		t.Fatalf("Export: %v", err)
	}

	want := "date,body,created,updated\n" +
		"2026-08-19,body 2026-08-19,2026-08-19T18:42:00Z,2026-08-19T18:42:00Z\n" +
		"2026-08-20,body 2026-08-20,2026-08-19T18:42:00Z,2026-08-19T18:42:00Z\n"
	if buf.String() != want {
		t.Fatalf("Export =\n%q\nwant\n%q", buf.String(), want)
	}
}

func TestExportQuotesAwkwardBodies(t *testing.T) {
	s := memstore.New()
	ts := time.Date(2026, 8, 19, 18, 42, 0, 0, time.UTC)
	body := "line one,\nline \"two\""
	if err := s.Put(journal.Entry{Date: "2026-08-19", Body: body, Created: ts, Updated: ts}); err != nil {
		t.Fatalf("Put: %v", err)
	}

	var buf bytes.Buffer
	if err := csvio.Export(&buf, s); err != nil {
		t.Fatalf("Export: %v", err)
	}
	if !strings.Contains(buf.String(), "\"line one,\nline \"\"two\"\"\"") {
		t.Fatalf("body not RFC 4180 quoted:\n%s", buf.String())
	}
}

// Timestamps stored in a non-UTC zone must still be written as UTC, so that
// exports are comparable and round-trips are stable.
func TestExportNormalisesTimestampsToUTC(t *testing.T) {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skipf("tzdata unavailable: %v", err)
	}
	s := memstore.New()
	ts := time.Date(2026, 8, 19, 14, 42, 0, 0, loc) // 18:42 UTC
	if err := s.Put(journal.Entry{Date: "2026-08-19", Body: "x", Created: ts, Updated: ts}); err != nil {
		t.Fatalf("Put: %v", err)
	}

	var buf bytes.Buffer
	if err := csvio.Export(&buf, s); err != nil {
		t.Fatalf("Export: %v", err)
	}
	if !strings.Contains(buf.String(), "2026-08-19T18:42:00Z") {
		t.Fatalf("timestamp not normalised to UTC:\n%s", buf.String())
	}
}
