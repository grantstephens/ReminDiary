package csvio_test

import (
	"bytes"
	"strings"
	"testing"
	"time"

	"remindiary/internal/csvio"
	"remindiary/internal/journal"
	"remindiary/internal/memstore"
)

var importNow = time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)

func TestImportBasic(t *testing.T) {
	s := memstore.New()
	in := "date,body,created,updated\n" +
		"2026-08-19,hello,2026-08-19T18:42:00Z,2026-08-19T18:42:00Z\n" +
		"2026-08-20,world,2026-08-20T09:00:00Z,2026-08-20T09:00:00Z\n"

	res, err := csvio.Import(strings.NewReader(in), s, false, importNow)
	if err != nil {
		t.Fatalf("Import: %v", err)
	}
	if res.Imported != 2 || res.Skipped != 0 || res.Failed != 0 {
		t.Fatalf("result = %+v, want 2 imported", res)
	}
	e, ok, err := s.Get("2026-08-19")
	if err != nil || !ok {
		t.Fatalf("Get: ok=%v err=%v", ok, err)
	}
	if e.Body != "hello" {
		t.Fatalf("Body = %q", e.Body)
	}
	if want := time.Date(2026, 8, 19, 18, 42, 0, 0, time.UTC); !e.Created.Equal(want) {
		t.Fatalf("Created = %v, want %v", e.Created, want)
	}
}

func TestImportSkipsExistingByDefault(t *testing.T) {
	s := memstore.New()
	if err := s.Put(journal.Entry{Date: "2026-08-19", Body: "mine", Created: importNow, Updated: importNow}); err != nil {
		t.Fatalf("Put: %v", err)
	}
	in := "date,body\n2026-08-19,theirs\n2026-08-20,new\n"

	res, err := csvio.Import(strings.NewReader(in), s, false, importNow)
	if err != nil {
		t.Fatalf("Import: %v", err)
	}
	if res.Imported != 1 || res.Skipped != 1 {
		t.Fatalf("result = %+v, want 1 imported 1 skipped", res)
	}
	e, _, err := s.Get("2026-08-19")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if e.Body != "mine" {
		t.Fatalf("existing entry was overwritten: Body = %q, want %q", e.Body, "mine")
	}
}

func TestImportOverwriteReplacesExisting(t *testing.T) {
	s := memstore.New()
	if err := s.Put(journal.Entry{Date: "2026-08-19", Body: "mine", Created: importNow, Updated: importNow}); err != nil {
		t.Fatalf("Put: %v", err)
	}
	in := "date,body\n2026-08-19,theirs\n"

	res, err := csvio.Import(strings.NewReader(in), s, true, importNow)
	if err != nil {
		t.Fatalf("Import: %v", err)
	}
	if res.Imported != 1 || res.Skipped != 0 {
		t.Fatalf("result = %+v, want 1 imported 0 skipped", res)
	}
	e, _, err := s.Get("2026-08-19")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if e.Body != "theirs" {
		t.Fatalf("Body = %q, want %q", e.Body, "theirs")
	}
}

func TestImportFillsMissingTimestamps(t *testing.T) {
	s := memstore.New()
	in := "date,body\n2026-08-19,hello\n"

	if _, err := csvio.Import(strings.NewReader(in), s, false, importNow); err != nil {
		t.Fatalf("Import: %v", err)
	}
	e, _, err := s.Get("2026-08-19")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if !e.Created.Equal(importNow) || !e.Updated.Equal(importNow) {
		t.Fatalf("timestamps = %v/%v, want %v", e.Created, e.Updated, importNow)
	}
}

func TestImportRowFailures(t *testing.T) {
	s := memstore.New()
	in := "date,body,created,updated\n" +
		"2026-08-19,good,2026-08-19T18:42:00Z,2026-08-19T18:42:00Z\n" +
		"19/08/2026,bad date,,\n" +
		"2026-08-21,,,\n" +
		"2026-08-22,dupe body,not-a-time,\n" +
		"2026-08-19,duplicate date,,\n"

	res, err := csvio.Import(strings.NewReader(in), s, false, importNow)
	if err != nil {
		t.Fatalf("Import: %v", err)
	}
	if res.Imported != 1 {
		t.Fatalf("Imported = %d, want 1", res.Imported)
	}
	if res.Failed != 4 {
		t.Fatalf("Failed = %d, want 4 (bad date, empty body, bad timestamp, duplicate date): %v", res.Failed, res.Errors)
	}
	if len(res.Errors) != 4 {
		t.Fatalf("Errors = %v, want 4", res.Errors)
	}
	// Row numbers are 1-based and count the header, so the bad date is row 3.
	if res.Errors[0].Row != 3 {
		t.Fatalf("first error row = %d, want 3", res.Errors[0].Row)
	}
	if !strings.Contains(res.Errors[0].Error(), "row 3") {
		t.Fatalf("RowError.Error = %q, want it to name the row", res.Errors[0].Error())
	}
}

func TestImportRejectsBadHeader(t *testing.T) {
	tests := []struct {
		name string
		in   string
	}{
		{"missing date column", "body\nhello\n"},
		{"missing body column", "date\n2026-08-19\n"},
		{"unknown column", "date,body,mood\n2026-08-19,hello,fine\n"},
		{"empty file", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := memstore.New()
			if _, err := csvio.Import(strings.NewReader(tt.in), s, false, importNow); err == nil {
				t.Fatal("Import succeeded, want error")
			}
			dates, err := s.Dates()
			if err != nil {
				t.Fatalf("Dates: %v", err)
			}
			if len(dates) != 0 {
				t.Fatalf("store was written despite a bad header: %v", dates)
			}
		})
	}
}

func TestImportAcceptsColumnsInAnyOrder(t *testing.T) {
	s := memstore.New()
	in := "body,date\nhello,2026-08-19\n"
	if _, err := csvio.Import(strings.NewReader(in), s, false, importNow); err != nil {
		t.Fatalf("Import: %v", err)
	}
	e, ok, err := s.Get("2026-08-19")
	if err != nil || !ok {
		t.Fatalf("Get: ok=%v err=%v", ok, err)
	}
	if e.Body != "hello" {
		t.Fatalf("Body = %q, want %q", e.Body, "hello")
	}
}

// Spreadsheet exports routinely carry a UTF-8 BOM; it must not become part of
// the first column name.
func TestImportStripsBOM(t *testing.T) {
	s := memstore.New()
	in := "\ufeff" + "date,body\n2026-08-19,hello\n"
	res, err := csvio.Import(strings.NewReader(in), s, false, importNow)
	if err != nil {
		t.Fatalf("Import with BOM: %v", err)
	}
	if res.Imported != 1 {
		t.Fatalf("Imported = %d, want 1", res.Imported)
	}
}

func TestImportHandlesEmbeddedNewlinesAndQuotes(t *testing.T) {
	s := memstore.New()
	in := "date,body\n2026-08-19,\"line one,\nline \"\"two\"\"\"\n"
	if _, err := csvio.Import(strings.NewReader(in), s, false, importNow); err != nil {
		t.Fatalf("Import: %v", err)
	}
	e, _, err := s.Get("2026-08-19")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if want := "line one,\nline \"two\""; e.Body != want {
		t.Fatalf("Body = %q, want %q", e.Body, want)
	}
}

// Export then import into an empty store then export again must be byte
// identical, which is what makes the CSV a trustworthy backup.
func TestRoundTripIsIdentity(t *testing.T) {
	original := memstore.New()
	ts := time.Date(2026, 8, 19, 18, 42, 0, 0, time.UTC)
	bodies := map[journal.Date]string{
		"2024-02-29": "leap day",
		"2025-12-31": "line one,\nline \"two\"",
		"2026-08-19": "plain",
	}
	for d, body := range bodies {
		if err := original.Put(journal.Entry{Date: d, Body: body, Created: ts, Updated: ts}); err != nil {
			t.Fatalf("Put: %v", err)
		}
	}

	var first bytes.Buffer
	if err := csvio.Export(&first, original); err != nil {
		t.Fatalf("first Export: %v", err)
	}

	restored := memstore.New()
	res, err := csvio.Import(bytes.NewReader(first.Bytes()), restored, false, importNow)
	if err != nil {
		t.Fatalf("Import: %v", err)
	}
	if res.Imported != len(bodies) || res.Failed != 0 {
		t.Fatalf("result = %+v, want %d imported 0 failed", res, len(bodies))
	}

	var second bytes.Buffer
	if err := csvio.Export(&second, restored); err != nil {
		t.Fatalf("second Export: %v", err)
	}
	if first.String() != second.String() {
		t.Fatalf("round trip not identity:\nfirst:\n%s\nsecond:\n%s", first.String(), second.String())
	}
}

// A store whose write fails must be left untouched, and the failure must be
// reported as an error rather than a partial result.
func TestImportIsAtomicOnWriteFailure(t *testing.T) {
	s := &failingPutAllStore{Store: memstore.New()}
	in := "date,body\n2026-08-19,hello\n2026-08-20,world\n"

	if _, err := csvio.Import(strings.NewReader(in), s, false, importNow); err == nil {
		t.Fatal("Import succeeded despite a failing PutAll, want error")
	}
	dates, err := s.Dates()
	if err != nil {
		t.Fatalf("Dates: %v", err)
	}
	if len(dates) != 0 {
		t.Fatalf("store was written despite a failing PutAll: %v", dates)
	}
}

type failingPutAllStore struct {
	journal.Store
}

func (f *failingPutAllStore) PutAll([]journal.Entry) error {
	return errFailedWrite
}

var errFailedWrite = errorString("write failed")

type errorString string

func (e errorString) Error() string { return string(e) }
