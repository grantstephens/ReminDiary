package ui

import (
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/theme"

	"github.com/grantstephens/remindiary/internal/journal"
)

// App wires the four screens into a tabbed layout and owns the cross-screen
// behaviour: saving reveals Memories, and importing reloads everything.
type App struct {
	tabs *container.AppTabs

	write    *Write
	memories *Memories
	stats    *Stats
	data     *Data

	memoriesTab *container.TabItem
}

// New builds the app UI against store. win is needed for dialogs; now supplies
// the current instant so tests can pin "today".
func New(store journal.Store, win fyne.Window, now func() time.Time) (*App, error) {
	a := &App{
		write:    NewWrite(store, win, now),
		memories: NewMemories(store, now),
		stats:    NewStats(store, now),
		data:     NewData(store, win, now),
	}

	writeTab := container.NewTabItemWithIcon("Write", theme.DocumentCreateIcon(), a.write.Content())
	a.memoriesTab = container.NewTabItemWithIcon("Memories", theme.HistoryIcon(), a.memories.Content())
	statsTab := container.NewTabItemWithIcon("Stats", theme.InfoIcon(), a.stats.Content())
	dataTab := container.NewTabItemWithIcon("Data", theme.StorageIcon(), a.data.Content())

	a.tabs = container.NewAppTabs(writeTab, a.memoriesTab, statsTab, dataTab)
	// Bottom placement keeps the tabs thumb-reachable on a phone.
	a.tabs.SetTabLocation(container.TabLocationBottom)

	// The soft gate: writing today pays out immediately by revealing Memories,
	// which was reachable all along.
	a.write.OnSaved = func(journal.Date) {
		if err := a.refreshDerived(); err != nil {
			dialog.ShowError(err, win)
			return
		}
		a.tabs.Select(a.memoriesTab)
	}

	a.data.OnImported = func() {
		if err := a.reload(); err != nil {
			dialog.ShowError(err, win)
		}
	}

	if err := a.reload(); err != nil {
		return nil, err
	}
	return a, nil
}

// Content returns the root canvas object.
func (a *App) Content() fyne.CanvasObject { return a.tabs }

// reload re-reads every screen from the store, including the editor, which is
// what an import needs.
func (a *App) reload() error {
	date := a.write.Date()
	if date == "" {
		date = a.write.Today()
	}
	if err := a.write.Show(date); err != nil {
		return err
	}
	return a.refreshDerived()
}

// refreshDerived reloads the screens computed from stored data.
func (a *App) refreshDerived() error {
	if err := a.memories.Refresh(); err != nil {
		return err
	}
	return a.stats.Refresh()
}
