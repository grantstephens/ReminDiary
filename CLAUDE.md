# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An offline daily journal (Fyne + bbolt). One entry per calendar date; saving today's
entry reveals what you wrote on the same day in previous years. Android is the shipping
target; the desktop build exists only so iteration does not need a device.

The design spec and implementation plan live under `docs/` in the local working tree
and are both still current, but they are deliberately not published to the remote — see
`.gitignore`. The one amendment the plan made to the spec was `Store.PutAll`.

## Commands

```bash
make check          # gofmt + go vet + go test — the gate before any commit
make test           # go test -tags ci ./...
go test -tags ci ./internal/csvio -run TestImportSkipsExisting   # single test
make run            # real desktop window (needs GL/X libs; `make deps` reports gaps)
make run-headless   # full startup path, software driver, exits immediately
make apk            # Android package (needs fyne CLI + ANDROID_HOME/ANDROID_NDK_HOME)
make apk RELEASE=1 ABI=arm64   # ~25MB single-ABI release build for a real phone
```

`TAGS` defaults to `ci`, which selects Fyne's software driver so every target works on a
headless machine. Only `cmd/remindiary` needs the tag — it is the one package that pulls
in a driver; the test suite is headless either way. To exercise the real GLFW desktop
driver: `make check TAGS=`.

## Architecture

Layered, dependencies pointing inward. `ui` and `csvio` depend on `journal`; `boltstore`
and `memstore` implement `journal.Store`; nothing depends on `ui`; `cmd/remindiary` is
the only package that knows both `boltstore` and `ui` exist.

| Package | Role |
|---|---|
| `internal/journal` | Domain only: `Date`, `Entry`, the `Store` interface, `ComputeStats`. No storage, UI, or file-format code. |
| `internal/boltstore` | bbolt `Store`. Bucket `entries`: ISO date key → JSON `Entry`. Bucket `meta`: `schema_version`. |
| `internal/memstore` | In-memory `Store` for every other package's tests. |
| `internal/storetest` | The `Store` behavioural contract, run against *both* implementations. |
| `internal/csvio` | Import/export against a `Store`. |
| `internal/ui` | Four Fyne screens plus `app.go`, which wires them together. |

### Invariants worth not breaking

- **`journal.Date` is a string, `"2006-01-02"`, always zero-padded.** Construct only via
  `ParseDate`, `Today`, or `Date.Add`. The padding is load-bearing: lexicographic order is
  chronological order, which is why bbolt needs no secondary index and ranged walks are
  plain cursor scans.
- **All date arithmetic happens in UTC** (`Date.Time()` returns midnight UTC) so a local
  DST transition can never add or drop a day. Timestamps are RFC3339 UTC in both bbolt
  values and CSV.
- **Stats are always derived, never stored.** `ComputeStats(dates, today)` from the date
  set alone. Grace rule: an unwritten *today* does not end the streak, an unwritten
  *yesterday* does.
- **Import is all-or-nothing.** The whole file parses and validates first, then one
  `PutAll`. Invalid rows are counted and reported per row (1-based, counting the header,
  so the number matches what a spreadsheet shows) but never abort the import.
- **Nothing panics on a user's phone.** Store methods return errors; the UI surfaces them
  with `dialog.ShowError`. A failed database open renders an error screen, not a black
  window. A cancelled file picker is not an error.
- **Dependencies are exactly `fyne.io/fyne/v2` and `go.etcd.io/bbolt`.** Adding a third
  is a decision, not a convenience.
- Out of scope by design: notifications, full-text search, calendar picker or archive
  list, future-dated entries, more than one entry per day.

### UI conventions

Each screen is a struct with `NewX(store, [win,] now)`, a `Content() fyne.CanvasObject`,
and — for the derived screens — a `Refresh() error`. Screens never reach across to each
other: they expose callbacks (`Write.OnSaved`, `Data.OnImported`) that `app.go` wires to
`reload()` / `refreshDerived()`.

`now func() time.Time` is injected everywhere rather than calling `time.Now`, so tests can
pin "today" (`nowFunc` in `internal/ui/write_test.go`). `FyneApp.toml` sets
`fyneDo = true`, declaring that every UI call is already on the main goroutine — keep it
that way.

## Testing

TDD throughout: failing test first, watch it fail, then implement.

- `journal` — table-driven pure logic (month/year/leap boundaries, streak rules, DST).
- Store implementations — add cases to `storetest.Run`, never to one store's own test file;
  running one suite against both is what stops `memstore` from diverging from real bbolt
  behaviour.
- `csvio` — round-trip identity (export → import into empty → export is byte-identical),
  skip vs overwrite, malformed rows, embedded newlines/quotes, BOM, in-file duplicate
  dates, atomicity.
- `ui` — `test.NewApp()` smoke tests over `memstore`; assert behaviour (which tab is
  selected, which date loaded, whether the discard prompt fired), not pixels.

## Data

The database is `journal.db` in the app's private storage — Android app-private dir, or
`~/.config/fyne/xyz.hub13.remindiary/` on desktop; one code path via
`fyne.App.Storage().RootURI()`. `tools/convert-legacy-backup.py` converts an old
`timestamp,body` export into the `date,body,created,updated` CSV that `csvio.Import` wants,
applying the after-midnight-belongs-to-yesterday rule.

## Assets

`icon.png` (512x512, full-bleed, no alpha) is a committed asset, not a build product —
there is no generator target and nothing regenerates it. `icon.svg` beside it is the
editable source; re-export with `rsvg-convert -w 1024 -h 1024 icon.svg -o /tmp/i.png &&
magick /tmp/i.png -resize 512x512 -strip icon.png` if you change it. The numeral is an
outlined path rather than `<text>` so the SVG renders identically without fonts. Keep the
artwork inside the centre of the canvas: Android's adaptive-icon mask crops to a circle or
squircle, and the full-bleed background is what gives it something to crop.
