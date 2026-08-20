// Command remindiary is a daily journal that reveals what you wrote on the
// same day in previous years.
package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"github.com/grantstephens/remindiary/internal/boltstore"
	"github.com/grantstephens/remindiary/internal/ui"
)

// appID must match the ID in FyneApp.toml; it determines where Fyne puts the
// app's private storage.
const appID = "xyz.hub13.remindiary"

func main() {
	a := app.NewWithID(appID)
	win := a.NewWindow("ReminDiary")
	win.Resize(fyne.NewSize(400, 700))

	store, err := openStore(a)
	if err != nil {
		// A storage failure must explain itself rather than crash or show a
		// blank window.
		win.SetContent(errorScreen(err))
		win.ShowAndRun()
		return
	}
	defer store.Close()

	screens, err := ui.New(store, win, time.Now)
	if err != nil {
		win.SetContent(errorScreen(err))
		win.ShowAndRun()
		return
	}

	win.SetContent(screens.Content())
	win.ShowAndRun()
}

// openStore resolves the app's private storage directory and opens the
// database inside it. Storage().RootURI() is the app-private directory on
// Android and ~/.config/fyne/<appID>/ on desktop, so one code path serves both.
func openStore(a fyne.App) (*boltstore.Store, error) {
	root := a.Storage().RootURI()
	if root == nil {
		return nil, errors.New("no application storage is available")
	}
	dir := root.Path()
	if dir == "" {
		return nil, fmt.Errorf("application storage %q has no filesystem path", root.String())
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("create storage directory %s: %w", dir, err)
	}
	return boltstore.Open(filepath.Join(dir, "journal.db"))
}

// errorScreen renders a startup failure.
func errorScreen(err error) fyne.CanvasObject {
	title := widget.NewLabelWithStyle("ReminDiary could not start", fyne.TextAlignCenter, fyne.TextStyle{Bold: true})
	detail := widget.NewLabel(err.Error())
	detail.Wrapping = fyne.TextWrapWord
	return container.NewVBox(title, detail)
}
