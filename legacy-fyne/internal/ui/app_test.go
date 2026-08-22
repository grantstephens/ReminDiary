package ui

import (
	"strings"
	"testing"

	"fyne.io/fyne/v2/test"

	"github.com/grantstephens/remindiary/internal/journal"
	"github.com/grantstephens/remindiary/internal/memstore"
)

func newAppFixture(t *testing.T) (*App, journal.Store) {
	t.Helper()
	a := test.NewApp()
	t.Cleanup(a.Quit)
	win := test.NewWindow(nil)
	t.Cleanup(win.Close)

	store := memstore.New()
	app, err := New(store, win, nowFunc)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	win.SetContent(app.Content())
	return app, store
}

func TestAppStartsOnWriteTab(t *testing.T) {
	app, _ := newAppFixture(t)
	if got := app.tabs.Selected().Text; got != "Write" {
		t.Fatalf("initial tab = %q, want Write", got)
	}
	if got := app.write.Date(); got != app.write.Today() {
		t.Fatalf("initial date = %q, want today %q", got, app.write.Today())
	}
}

// The soft gate: saving reveals the Memories tab.
func TestSavingRevealsMemories(t *testing.T) {
	app, store := newAppFixture(t)
	if err := store.Put(journal.Entry{Date: "2019-08-19", Body: "long ago"}); err != nil {
		t.Fatalf("Put: %v", err)
	}

	app.write.entry.SetText("today's words")
	app.write.saveFromUI()

	if got := app.tabs.Selected().Text; got != "Memories" {
		t.Fatalf("tab after save = %q, want Memories", got)
	}
	if len(app.memories.shown) != 1 {
		t.Fatalf("memories shown = %v, want the 2019 entry", app.memories.shown)
	}
	if app.stats.current.Total != 2 {
		t.Fatalf("stats total = %d, want 2", app.stats.current.Total)
	}
}

// A no-op save must not switch tabs; nothing was written.
func TestNoopSaveDoesNotReveal(t *testing.T) {
	app, _ := newAppFixture(t)
	app.write.entry.SetText("   ")
	app.write.saveFromUI()
	if got := app.tabs.Selected().Text; got != "Write" {
		t.Fatalf("tab after a no-op save = %q, want Write", got)
	}
}

func TestImportRefreshesScreens(t *testing.T) {
	app, _ := newAppFixture(t)
	if _, err := app.data.runImport(strings.NewReader("date,body\n2019-08-19,imported\n2026-08-19,today\n")); err != nil {
		t.Fatalf("runImport: %v", err)
	}
	if app.stats.current.Total != 2 {
		t.Fatalf("stats total = %d after import, want 2", app.stats.current.Total)
	}
	if len(app.memories.shown) != 1 {
		t.Fatalf("memories shown = %v after import, want the 2019 entry", app.memories.shown)
	}
	if app.write.entry.Text != "today" {
		t.Fatalf("write editor = %q after import, want the imported entry for today", app.write.entry.Text)
	}
}
