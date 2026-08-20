package ui

import (
	"fmt"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"remindiary/internal/journal"
)

// Memories is the On This Day screen: every previous year that has an entry
// for today's month and day, newest first. There is no cap and no paging; a
// dozen anniversaries means a dozen entries in one scrollable list.
type Memories struct {
	store journal.Store
	now   func() time.Time

	list    *fyne.Container
	content fyne.CanvasObject

	// shown is the filtered, ordered set most recently rendered.
	shown []journal.Entry
}

// NewMemories builds the Memories screen. Call Refresh before showing it.
func NewMemories(store journal.Store, now func() time.Time) *Memories {
	m := &Memories{store: store, now: now}
	m.list = container.NewVBox()
	m.content = container.NewVScroll(m.list)
	return m
}

// Content returns the screen's canvas object.
func (m *Memories) Content() fyne.CanvasObject { return m.content }

// Refresh reloads the list for today's month and day.
func (m *Memories) Refresh() error {
	today := journal.Today(m.now())

	found, err := m.store.OnThisDay(today.Month(), today.Day())
	if err != nil {
		return err
	}

	// OnThisDay includes the current year; the whole point of this screen is
	// previous years, so drop it here.
	m.shown = m.shown[:0]
	for _, e := range found {
		if e.Date.Year() < today.Year() {
			m.shown = append(m.shown, e)
		}
	}

	objects := make([]fyne.CanvasObject, 0, len(m.shown)*2+1)
	if len(m.shown) == 0 {
		empty := widget.NewLabel(emptyMemoriesText(today))
		empty.Wrapping = fyne.TextWrapWord
		objects = append(objects, empty)
	}
	for _, e := range m.shown {
		heading := widget.NewLabelWithStyle(
			fmt.Sprintf("%d — %s", e.Date.Year(), yearsAgoLabel(today.Year()-e.Date.Year())),
			fyne.TextAlignLeading,
			fyne.TextStyle{Bold: true},
		)
		body := widget.NewLabel(e.Body)
		body.Wrapping = fyne.TextWrapWord
		objects = append(objects, heading, body)
	}

	m.list.Objects = objects
	m.list.Refresh()
	return nil
}

// yearsAgoLabel renders the relative age of an entry.
func yearsAgoLabel(years int) string {
	if years == 1 {
		return "1 year ago"
	}
	return fmt.Sprintf("%d years ago", years)
}

// emptyMemoriesText is the first-year empty state, naming the day so it reads
// as an invitation rather than an error.
func emptyMemoriesText(today journal.Date) string {
	return fmt.Sprintf("Nothing from previous years yet. Come back next %s.", today.Time().Format("2 January"))
}
