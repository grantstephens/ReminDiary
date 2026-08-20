package ui

import (
	"strings"
	"testing"

	"fyne.io/fyne/v2/test"

	"github.com/grantstephens/remindiary/internal/journal"
	"github.com/grantstephens/remindiary/internal/memstore"
)

func TestStatsLinesEmpty(t *testing.T) {
	got := statsLines(journal.Stats{})
	if len(got) != 1 {
		t.Fatalf("statsLines = %v, want a single empty-state line", got)
	}
	if !strings.Contains(got[0], "No entries yet") {
		t.Fatalf("statsLines = %q, want an empty-state message", got[0])
	}
}

func TestStatsLinesPopulated(t *testing.T) {
	got := statsLines(journal.Stats{Current: 3, Longest: 12, Total: 400, Since: "2020-01-01"})
	want := []string{
		"Current streak: 3 days",
		"Longest streak: 12 days",
		"Total entries: 400",
		"Writing since: Wed 1 Jan 2020",
	}
	if len(got) != len(want) {
		t.Fatalf("statsLines = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("statsLines[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

// A streak of one must not read "1 days".
func TestStatsLinesSingularDay(t *testing.T) {
	got := statsLines(journal.Stats{Current: 1, Longest: 1, Total: 1, Since: "2026-08-19"})
	if got[0] != "Current streak: 1 day" {
		t.Fatalf("statsLines[0] = %q, want %q", got[0], "Current streak: 1 day")
	}
	if got[1] != "Longest streak: 1 day" {
		t.Fatalf("statsLines[1] = %q, want %q", got[1], "Longest streak: 1 day")
	}
}

func TestStatsRefreshReadsStore(t *testing.T) {
	a := test.NewApp()
	defer a.Quit()

	store := memstore.New()
	for _, d := range []journal.Date{"2026-08-17", "2026-08-18", "2026-08-19"} {
		if err := store.Put(journal.Entry{Date: d, Body: "x"}); err != nil {
			t.Fatalf("Put: %v", err)
		}
	}

	s := NewStats(store, nowFunc)
	if err := s.Refresh(); err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if s.current.Current != 3 || s.current.Total != 3 {
		t.Fatalf("stats = %+v, want a 3-day streak of 3 entries", s.current)
	}
}
