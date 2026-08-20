package ui

import (
	"fmt"
	"io"
	"strings"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"

	"remindiary/internal/csvio"
	"remindiary/internal/journal"
)

// maxReportedRows caps how many failed rows the result dialog quotes, so a
// thoroughly broken file does not produce an unreadable wall of text.
const maxReportedRows = 5

// Data is the import and export screen.
type Data struct {
	store journal.Store
	win   fyne.Window
	now   func() time.Time

	overwrite *widget.Check
	content   fyne.CanvasObject

	// OnImported is called after a successful import so the app can reload the
	// screens that now show stale data.
	OnImported func()
}

// NewData builds the Data screen.
func NewData(store journal.Store, win fyne.Window, now func() time.Time) *Data {
	d := &Data{store: store, win: win, now: now}

	d.overwrite = widget.NewCheck("Overwrite existing entries", nil)

	importBtn := widget.NewButtonWithIcon("Import CSV", theme.UploadIcon(), d.chooseImportFile)
	exportBtn := widget.NewButtonWithIcon("Export CSV", theme.DownloadIcon(), d.chooseExportFile)

	explain := widget.NewLabel(
		"Import merges a CSV into your journal. Dates you already have are skipped " +
			"unless you tick overwrite. Export writes every entry to a CSV file.")
	explain.Wrapping = fyne.TextWrapWord

	d.content = container.NewVScroll(container.NewVBox(
		explain,
		widget.NewSeparator(),
		d.overwrite,
		importBtn,
		widget.NewSeparator(),
		exportBtn,
	))
	return d
}

// Content returns the screen's canvas object.
func (d *Data) Content() fyne.CanvasObject { return d.content }

// runImport merges r into the store and reports the outcome. It is the tested
// core of the import button.
func (d *Data) runImport(r io.Reader) (csvio.ImportResult, error) {
	res, err := csvio.Import(r, d.store, d.overwrite.Checked, d.now())
	if err != nil {
		return csvio.ImportResult{}, err
	}
	if d.OnImported != nil {
		d.OnImported()
	}
	return res, nil
}

// runExport writes the whole journal to w.
func (d *Data) runExport(w io.Writer) error {
	return csvio.Export(w, d.store)
}

// chooseImportFile asks for a file and imports it, confirming first when
// overwrite is armed, because that is the one setting that can destroy data.
func (d *Data) chooseImportFile() {
	open := func() {
		dialog.ShowFileOpen(func(rc fyne.URIReadCloser, err error) {
			if err != nil {
				dialog.ShowError(err, d.win)
				return
			}
			if rc == nil {
				return // the user cancelled, which is not an error
			}
			defer rc.Close()

			res, err := d.runImport(rc)
			if err != nil {
				dialog.ShowError(err, d.win)
				return
			}
			dialog.ShowInformation("Import complete", formatImportResult(res), d.win)
		}, d.win)
	}

	if !d.overwrite.Checked {
		open()
		return
	}
	dialog.ShowConfirm(
		"Overwrite existing entries?",
		"Entries in the file will replace entries you already have for the same dates. This cannot be undone.",
		func(confirmed bool) {
			if confirmed {
				open()
			}
		},
		d.win,
	)
}

// chooseExportFile asks where to write and exports the journal there.
func (d *Data) chooseExportFile() {
	save := dialog.NewFileSave(func(wc fyne.URIWriteCloser, err error) {
		if err != nil {
			dialog.ShowError(err, d.win)
			return
		}
		if wc == nil {
			return // cancelled
		}
		defer wc.Close()

		if err := d.runExport(wc); err != nil {
			dialog.ShowError(err, d.win)
			return
		}
		dialog.ShowInformation("Export complete", "Your journal has been written to "+wc.URI().Name()+".", d.win)
	}, d.win)
	save.SetFileName(exportFileName(journal.Today(d.now())))
	save.Show()
}

// formatImportResult renders the receipt shown after an import.
func formatImportResult(res csvio.ImportResult) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Imported %d. Skipped %d existing. Failed %d.", res.Imported, res.Skipped, res.Failed)

	shown := res.Errors
	if len(shown) > maxReportedRows {
		shown = shown[:maxReportedRows]
	}
	for _, e := range shown {
		fmt.Fprintf(&b, "\n%s", e.Error())
	}
	if omitted := len(res.Errors) - len(shown); omitted > 0 {
		fmt.Fprintf(&b, "\n…and %d more.", omitted)
	}
	return b.String()
}

// exportFileName is the filename offered in the save dialog.
func exportFileName(today journal.Date) string {
	return "remindiary-" + today.String() + ".csv"
}
