package ui

import (
	"testing"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/test"

	"remindiary/internal/journal"
	"remindiary/internal/memstore"
)

var fixedNow = time.Date(2026, 8, 19, 18, 42, 0, 0, time.UTC)

func nowFunc() time.Time { return fixedNow }

func newWriteFixture(t *testing.T) (*Write, journal.Store, fyne.Window) {
	t.Helper()
	a := test.NewApp()
	t.Cleanup(a.Quit)
	win := test.NewWindow(nil)
	t.Cleanup(win.Close)

	store := memstore.New()
	w := NewWrite(store, win, nowFunc)
	win.SetContent(w.Content())
	if err := w.Show(w.Today()); err != nil {
		t.Fatalf("Show: %v", err)
	}
	return w, store, win
}

func TestWriteShowsExistingEntry(t *testing.T) {
	w, store, _ := newWriteFixture(t)
	if err := store.Put(journal.Entry{Date: "2026-08-18", Body: "yesterday", Created: fixedNow, Updated: fixedNow}); err != nil {
		t.Fatalf("Put: %v", err)
	}
	if err := w.Show("2026-08-18"); err != nil {
		t.Fatalf("Show: %v", err)
	}
	if w.entry.Text != "yesterday" {
		t.Fatalf("editor text = %q, want %q", w.entry.Text, "yesterday")
	}
	if w.Dirty() {
		t.Fatal("a freshly loaded entry must not be dirty")
	}
}

func TestWriteShowsEmptyForMissingEntry(t *testing.T) {
	w, _, _ := newWriteFixture(t)
	if err := w.Show("2020-01-01"); err != nil {
		t.Fatalf("Show: %v", err)
	}
	if w.entry.Text != "" {
		t.Fatalf("editor text = %q, want empty", w.entry.Text)
	}
}

func TestWriteDirtyAfterTyping(t *testing.T) {
	w, _, _ := newWriteFixture(t)
	w.entry.SetText("something")
	if !w.Dirty() {
		t.Fatal("expected dirty after typing")
	}
}

func TestWritePlannedSave(t *testing.T) {
	w, store, _ := newWriteFixture(t)

	w.entry.SetText("  ")
	if got := w.PlannedSave(); got != SaveNoop {
		t.Fatalf("blank text on an empty date = %v, want SaveNoop", got)
	}

	w.entry.SetText("real content")
	if got := w.PlannedSave(); got != SaveWrite {
		t.Fatalf("text on an empty date = %v, want SaveWrite", got)
	}

	if err := store.Put(journal.Entry{Date: "2026-08-18", Body: "existing", Created: fixedNow, Updated: fixedNow}); err != nil {
		t.Fatalf("Put: %v", err)
	}
	if err := w.Show("2026-08-18"); err != nil {
		t.Fatalf("Show: %v", err)
	}
	w.entry.SetText("")
	if got := w.PlannedSave(); got != SaveDelete {
		t.Fatalf("cleared text on an existing date = %v, want SaveDelete", got)
	}
}

func TestWriteCommitWritesEntry(t *testing.T) {
	w, store, _ := newWriteFixture(t)
	w.entry.SetText("today's words")
	if err := w.Commit(); err != nil {
		t.Fatalf("Commit: %v", err)
	}
	e, ok, err := store.Get(w.Today())
	if err != nil || !ok {
		t.Fatalf("Get: ok=%v err=%v", ok, err)
	}
	if e.Body != "today's words" {
		t.Fatalf("Body = %q", e.Body)
	}
	if !e.Created.Equal(fixedNow.UTC()) {
		t.Fatalf("Created = %v, want %v", e.Created, fixedNow.UTC())
	}
	if w.Dirty() {
		t.Fatal("expected not dirty after Commit")
	}
}

// Editing an existing entry must keep its original Created timestamp.
func TestWriteCommitPreservesCreated(t *testing.T) {
	w, store, _ := newWriteFixture(t)
	created := time.Date(2020, 1, 1, 8, 0, 0, 0, time.UTC)
	if err := store.Put(journal.Entry{Date: "2026-08-18", Body: "old", Created: created, Updated: created}); err != nil {
		t.Fatalf("Put: %v", err)
	}
	if err := w.Show("2026-08-18"); err != nil {
		t.Fatalf("Show: %v", err)
	}
	w.entry.SetText("edited")
	if err := w.Commit(); err != nil {
		t.Fatalf("Commit: %v", err)
	}
	e, _, err := store.Get("2026-08-18")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if !e.Created.Equal(created) {
		t.Fatalf("Created = %v, want preserved %v", e.Created, created)
	}
	if !e.Updated.Equal(fixedNow.UTC()) {
		t.Fatalf("Updated = %v, want %v", e.Updated, fixedNow.UTC())
	}
}

func TestWriteCommitDeletesClearedEntry(t *testing.T) {
	w, store, _ := newWriteFixture(t)
	if err := store.Put(journal.Entry{Date: "2026-08-18", Body: "old", Created: fixedNow, Updated: fixedNow}); err != nil {
		t.Fatalf("Put: %v", err)
	}
	if err := w.Show("2026-08-18"); err != nil {
		t.Fatalf("Show: %v", err)
	}
	w.entry.SetText("")
	if err := w.Commit(); err != nil {
		t.Fatalf("Commit: %v", err)
	}
	if _, ok, err := store.Get("2026-08-18"); err != nil || ok {
		t.Fatalf("entry still present after delete: ok=%v err=%v", ok, err)
	}
}

// A blank editor on a date with no entry must not create an empty row.
func TestWriteCommitNoopLeavesStoreEmpty(t *testing.T) {
	w, store, _ := newWriteFixture(t)
	w.entry.SetText("   ")
	if err := w.Commit(); err != nil {
		t.Fatalf("Commit: %v", err)
	}
	dates, err := store.Dates()
	if err != nil {
		t.Fatalf("Dates: %v", err)
	}
	if len(dates) != 0 {
		t.Fatalf("Dates = %v, want empty", dates)
	}
}

func TestWriteStepBack(t *testing.T) {
	w, _, _ := newWriteFixture(t)
	w.StepBack()
	if got, want := w.Date(), journal.Date("2026-08-18"); got != want {
		t.Fatalf("Date = %q, want %q", got, want)
	}
}

func TestWriteCannotStepPastToday(t *testing.T) {
	w, _, _ := newWriteFixture(t)
	if !w.next.Disabled() {
		t.Fatal("forward button must be disabled on today")
	}
	w.StepForward()
	if got := w.Date(); got != w.Today() {
		t.Fatalf("Date = %q, want to stay on today %q", got, w.Today())
	}

	w.StepBack()
	if w.next.Disabled() {
		t.Fatal("forward button must be enabled when not on today")
	}
	w.StepForward()
	if got := w.Date(); got != w.Today() {
		t.Fatalf("Date = %q, want %q", got, w.Today())
	}
}

// Navigating away with unsaved text must ask before discarding it.
func TestWriteStepWithUnsavedChangesConfirms(t *testing.T) {
	w, _, win := newWriteFixture(t)
	w.entry.SetText("unsaved thoughts")
	w.StepBack()

	if win.Canvas().Overlays().Top() == nil {
		t.Fatal("expected a confirmation dialog before discarding changes")
	}
	if got := w.Date(); got != w.Today() {
		t.Fatalf("Date = %q, want to stay on %q until the dialog is answered", got, w.Today())
	}
}
