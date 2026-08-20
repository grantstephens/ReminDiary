package ui

import (
	"fmt"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"remindiary/internal/journal"
)

// Stats is the statistics screen. Its numbers are always derived from the
// store, never cached.
type Stats struct {
	store journal.Store
	now   func() time.Time

	list    *fyne.Container
	content fyne.CanvasObject

	// current is the most recently computed set, kept for tests.
	current journal.Stats
}

// NewStats builds the Stats screen. Call Refresh before showing it.
func NewStats(store journal.Store, now func() time.Time) *Stats {
	s := &Stats{store: store, now: now}
	s.list = container.NewVBox()
	s.content = container.NewVScroll(s.list)
	return s
}

// Content returns the screen's canvas object.
func (s *Stats) Content() fyne.CanvasObject { return s.content }

// Refresh recomputes the statistics from the store.
func (s *Stats) Refresh() error {
	dates, err := s.store.Dates()
	if err != nil {
		return err
	}
	s.current = journal.ComputeStats(dates, journal.Today(s.now()))

	lines := statsLines(s.current)
	objects := make([]fyne.CanvasObject, 0, len(lines))
	for _, line := range lines {
		label := widget.NewLabel(line)
		label.Wrapping = fyne.TextWrapWord
		objects = append(objects, label)
	}
	s.list.Objects = objects
	s.list.Refresh()
	return nil
}

// statsLines renders statistics as display lines.
func statsLines(st journal.Stats) []string {
	if st.Total == 0 {
		return []string{"No entries yet. Write something today."}
	}
	return []string{
		"Current streak: " + days(st.Current),
		"Longest streak: " + days(st.Longest),
		fmt.Sprintf("Total entries: %d", st.Total),
		"Writing since: " + st.Since.Display(),
	}
}

// days renders a day count with the correct plural.
func days(n int) string {
	if n == 1 {
		return "1 day"
	}
	return fmt.Sprintf("%d days", n)
}
