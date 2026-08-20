package ui

import (
	"testing"

	"fyne.io/fyne/v2/test"

	"github.com/grantstephens/remindiary/internal/journal"
	"github.com/grantstephens/remindiary/internal/memstore"
)

func TestYearsAgoLabel(t *testing.T) {
	tests := []struct {
		years int
		want  string
	}{
		{1, "1 year ago"},
		{2, "2 years ago"},
		{9, "9 years ago"},
	}
	for _, tt := range tests {
		if got := yearsAgoLabel(tt.years); got != tt.want {
			t.Errorf("yearsAgoLabel(%d) = %q, want %q", tt.years, got, tt.want)
		}
	}
}

func TestEmptyMemoriesText(t *testing.T) {
	got := emptyMemoriesText("2026-08-19")
	want := "Nothing from previous years yet. Come back next 19 August."
	if got != want {
		t.Fatalf("emptyMemoriesText = %q, want %q", got, want)
	}
}

// Every previous year with an entry must be shown, newest first, and the
// current year must be excluded because it is what the user just wrote.
func TestMemoriesShowsAllPreviousYearsNewestFirst(t *testing.T) {
	a := test.NewApp()
	defer a.Quit()

	store := memstore.New()
	for _, d := range []journal.Date{
		"2019-08-19", "2021-08-19", "2024-08-19", "2026-08-19", // same day, several years
		"2020-08-18", // adjacent day, must not appear
		"2020-09-19", // same day-of-month, wrong month, must not appear
	} {
		if err := store.Put(journal.Entry{Date: d, Body: string(d)}); err != nil {
			t.Fatalf("Put %s: %v", d, err)
		}
	}

	m := NewMemories(store, nowFunc)
	if err := m.Refresh(); err != nil {
		t.Fatalf("Refresh: %v", err)
	}

	want := []journal.Date{"2024-08-19", "2021-08-19", "2019-08-19"}
	if len(m.shown) != len(want) {
		t.Fatalf("shown = %v, want %v", m.shown, want)
	}
	for i := range want {
		if m.shown[i].Date != want[i] {
			t.Fatalf("shown = %v, want %v", m.shown, want)
		}
	}
}

func TestMemoriesEmptyWhenNoPreviousYears(t *testing.T) {
	a := test.NewApp()
	defer a.Quit()

	store := memstore.New()
	if err := store.Put(journal.Entry{Date: "2026-08-19", Body: "only this year"}); err != nil {
		t.Fatalf("Put: %v", err)
	}

	m := NewMemories(store, nowFunc)
	if err := m.Refresh(); err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if len(m.shown) != 0 {
		t.Fatalf("shown = %v, want empty", m.shown)
	}
}
