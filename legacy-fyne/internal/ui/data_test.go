package ui

import (
	"bytes"
	"errors"
	"strings"
	"testing"

	"fyne.io/fyne/v2/test"

	"github.com/grantstephens/remindiary/internal/csvio"
	"github.com/grantstephens/remindiary/internal/journal"
	"github.com/grantstephens/remindiary/internal/memstore"
)

func TestExportFileName(t *testing.T) {
	if got, want := exportFileName("2026-08-19"), "remindiary-2026-08-19.csv"; got != want {
		t.Fatalf("exportFileName = %q, want %q", got, want)
	}
}

func TestFormatImportResultCounts(t *testing.T) {
	got := formatImportResult(csvio.ImportResult{Imported: 340, Skipped: 12, Failed: 0})
	want := "Imported 340. Skipped 12 existing. Failed 0."
	if got != want {
		t.Fatalf("formatImportResult = %q, want %q", got, want)
	}
}

func TestFormatImportResultListsFailures(t *testing.T) {
	res := csvio.ImportResult{
		Imported: 1,
		Failed:   2,
		Errors: []csvio.RowError{
			{Row: 41, Err: errors.New(`invalid date "19/08/2026"`)},
			{Row: 88, Err: errors.New("empty body")},
		},
	}
	got := formatImportResult(res)
	if !strings.Contains(got, "row 41: invalid date") {
		t.Fatalf("formatImportResult = %q, want it to quote row 41", got)
	}
	if !strings.Contains(got, "row 88: empty body") {
		t.Fatalf("formatImportResult = %q, want it to quote row 88", got)
	}
}

// A file with hundreds of bad rows must not produce a dialog hundreds of lines
// long.
func TestFormatImportResultTruncatesFailures(t *testing.T) {
	res := csvio.ImportResult{Failed: 20}
	for i := 1; i <= 20; i++ {
		res.Errors = append(res.Errors, csvio.RowError{Row: i, Err: errors.New("bad")})
	}
	got := formatImportResult(res)
	if strings.Count(got, "row ") > maxReportedRows {
		t.Fatalf("formatImportResult listed more than %d rows:\n%s", maxReportedRows, got)
	}
	if !strings.Contains(got, "15 more") {
		t.Fatalf("formatImportResult = %q, want it to say how many were omitted", got)
	}
}

func TestDataRunImportAndExport(t *testing.T) {
	a := test.NewApp()
	defer a.Quit()
	win := test.NewWindow(nil)
	defer win.Close()

	store := memstore.New()
	d := NewData(store, win, nowFunc)

	called := false
	d.OnImported = func() { called = true }

	in := "date,body\n2026-08-19,hello\n"
	res, err := d.runImport(strings.NewReader(in))
	if err != nil {
		t.Fatalf("runImport: %v", err)
	}
	if res.Imported != 1 {
		t.Fatalf("Imported = %d, want 1", res.Imported)
	}
	if !called {
		t.Fatal("OnImported was not called after a successful import")
	}

	var buf bytes.Buffer
	if err := d.runExport(&buf); err != nil {
		t.Fatalf("runExport: %v", err)
	}
	if !strings.Contains(buf.String(), "2026-08-19,hello,") {
		t.Fatalf("export missing the imported entry:\n%s", buf.String())
	}
}

// The overwrite checkbox is what decides the merge mode, so it must reach
// csvio.Import.
func TestDataOverwriteCheckboxDrivesMergeMode(t *testing.T) {
	a := test.NewApp()
	defer a.Quit()
	win := test.NewWindow(nil)
	defer win.Close()

	store := memstore.New()
	if err := store.Put(journal.Entry{Date: "2026-08-19", Body: "mine"}); err != nil {
		t.Fatalf("Put: %v", err)
	}
	d := NewData(store, win, nowFunc)

	in := "date,body\n2026-08-19,theirs\n"
	if res, err := d.runImport(strings.NewReader(in)); err != nil {
		t.Fatalf("runImport: %v", err)
	} else if res.Skipped != 1 {
		t.Fatalf("Skipped = %d, want 1 with overwrite off", res.Skipped)
	}

	d.overwrite.SetChecked(true)
	if res, err := d.runImport(strings.NewReader(in)); err != nil {
		t.Fatalf("runImport: %v", err)
	} else if res.Imported != 1 {
		t.Fatalf("Imported = %d, want 1 with overwrite on", res.Imported)
	}
	e, _, err := store.Get("2026-08-19")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if e.Body != "theirs" {
		t.Fatalf("Body = %q, want %q", e.Body, "theirs")
	}
}
