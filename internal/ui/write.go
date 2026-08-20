// Package ui holds every Fyne screen. It depends on journal and csvio only,
// never on a concrete store implementation, so screens can be driven by an
// in-memory store in tests.
package ui

import (
	"strings"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"

	"github.com/grantstephens/remindiary/internal/journal"
)

// SaveAction is what saving the current editor state would do.
type SaveAction int

const (
	// SaveWrite writes the editor contents as an entry.
	SaveWrite SaveAction = iota
	// SaveDelete removes an existing entry that has been cleared.
	SaveDelete
	// SaveNoop does nothing, because a blank editor on a date with no entry
	// must not create an empty entry.
	SaveNoop
)

// Write is the home screen: a date header with day-stepping arrows, the
// editor, and a save button.
type Write struct {
	store journal.Store
	win   fyne.Window
	now   func() time.Time

	date   journal.Date
	loaded string
	exists bool

	header *widget.Label
	badge  *widget.Label
	entry  *widget.Entry
	prev   *widget.Button
	next   *widget.Button

	content fyne.CanvasObject

	// OnSaved is called after a successful save or delete, with the date that
	// was written. It is how the app knows to reveal the Memories tab.
	OnSaved func(journal.Date)
}

// NewWrite builds the Write screen. now supplies the current instant, which
// keeps "today" injectable for tests.
func NewWrite(store journal.Store, win fyne.Window, now func() time.Time) *Write {
	w := &Write{store: store, win: win, now: now}

	w.header = widget.NewLabelWithStyle("", fyne.TextAlignCenter, fyne.TextStyle{Bold: true})
	w.badge = widget.NewLabelWithStyle("", fyne.TextAlignCenter, fyne.TextStyle{Italic: true})

	w.entry = widget.NewMultiLineEntry()
	w.entry.Wrapping = fyne.TextWrapWord
	w.entry.SetPlaceHolder("What happened today?")

	w.prev = widget.NewButtonWithIcon("", theme.NavigateBackIcon(), w.StepBack)
	w.next = widget.NewButtonWithIcon("", theme.NavigateNextIcon(), w.StepForward)

	save := widget.NewButtonWithIcon("Save", theme.DocumentSaveIcon(), w.saveFromUI)
	save.Importance = widget.HighImportance

	top := container.NewBorder(nil, nil, w.prev, w.next, container.NewVBox(w.header, w.badge))
	w.content = container.NewBorder(top, save, nil, nil, w.entry)
	return w
}

// Content returns the screen's canvas object.
func (w *Write) Content() fyne.CanvasObject { return w.content }

// Date returns the date currently loaded in the editor.
func (w *Write) Date() journal.Date { return w.date }

// Today returns today's calendar date.
func (w *Write) Today() journal.Date { return journal.Today(w.now()) }

// Show loads d into the editor, replacing whatever was there. Callers are
// responsible for handling unsaved changes first.
func (w *Write) Show(d journal.Date) error {
	e, ok, err := w.store.Get(d)
	if err != nil {
		return err
	}
	w.date = d
	w.exists = ok
	w.loaded = ""
	if ok {
		w.loaded = e.Body
	}
	w.entry.SetText(w.loaded)
	w.refreshHeader()
	return nil
}

// Dirty reports whether the editor differs from what was loaded.
func (w *Write) Dirty() bool { return w.entry.Text != w.loaded }

// StepBack moves the editor one day earlier.
func (w *Write) StepBack() { w.step(-1) }

// StepForward moves the editor one day later, stopping at today.
func (w *Write) StepForward() { w.step(1) }

// PlannedSave reports what Commit would do. Keeping the decision separate from
// the action lets the UI ask for confirmation first and lets tests assert the
// rule without driving a dialog.
func (w *Write) PlannedSave() SaveAction {
	if strings.TrimSpace(w.entry.Text) == "" {
		if w.exists {
			return SaveDelete
		}
		return SaveNoop
	}
	return SaveWrite
}

// Commit applies PlannedSave. It preserves the original Created timestamp when
// editing an existing entry.
func (w *Write) Commit() error {
	switch w.PlannedSave() {
	case SaveNoop:
		return nil

	case SaveDelete:
		if err := w.store.Delete(w.date); err != nil {
			return err
		}
		w.loaded, w.exists = "", false
		w.entry.SetText("")
		return nil
	}

	body := strings.TrimRight(w.entry.Text, " \t\r\n")
	now := w.now().UTC()
	e := journal.Entry{Date: w.date, Body: body, Created: now, Updated: now}
	if existing, ok, err := w.store.Get(w.date); err != nil {
		return err
	} else if ok {
		e.Created = existing.Created
	}
	if err := w.store.Put(e); err != nil {
		return err
	}
	w.loaded, w.exists = body, true
	w.entry.SetText(body)
	return nil
}

// refreshHeader updates the date caption and the forward button, which is
// disabled on today because future-dated entries are not supported.
func (w *Write) refreshHeader() {
	w.header.SetText(w.date.Display())
	if w.date == w.Today() {
		w.badge.SetText("today")
		w.next.Disable()
		return
	}
	w.badge.SetText("")
	w.next.Enable()
}

// step moves the editor by days, confirming first if there are unsaved edits.
func (w *Write) step(days int) {
	target := w.date.Add(days)
	if target > w.Today() {
		return
	}
	move := func() {
		if err := w.Show(target); err != nil {
			dialog.ShowError(err, w.win)
		}
	}
	if !w.Dirty() {
		move()
		return
	}
	dialog.ShowConfirm(
		"Discard changes?",
		"Your unsaved changes to "+w.date.Display()+" will be lost.",
		func(discard bool) {
			if discard {
				move()
			}
		},
		w.win,
	)
}

// saveFromUI is the Save button's handler: confirm a delete, apply, then notify.
func (w *Write) saveFromUI() {
	apply := func() {
		saved := w.date
		if err := w.Commit(); err != nil {
			dialog.ShowError(err, w.win)
			return
		}
		if w.OnSaved != nil {
			w.OnSaved(saved)
		}
	}

	switch w.PlannedSave() {
	case SaveNoop:
		return
	case SaveDelete:
		dialog.ShowConfirm(
			"Delete this entry?",
			"Saving an empty entry for "+w.date.Display()+" deletes it.",
			func(remove bool) {
				if remove {
					apply()
				}
			},
			w.win,
		)
		return
	}
	apply()
}
