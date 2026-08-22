@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An offline daily journal (React Native + Expo). One entry per calendar date; saving
today's entry reveals what you wrote on the same day in previous years. Android and the
web are both shipping targets.

This is a from-scratch rewrite of the app previously implemented in Go/Fyne, which now
lives in [`legacy-fyne/`](legacy-fyne/) — see its own section below. The rewrite exists
because Fyne's Android text editor is broken at the architecture level: it relays
keystrokes to a permanently-invisible dummy `EditText` while drawing the visible text,
cursor and selection itself, which is why the on-screen keyboard sizes oddly and
copy/paste never feels native. React Native's `TextInput` wraps the real native widget
instead. `legacy-fyne/` stays working, and its release pipeline stays live, until this
app reaches parity and the real diary data has been migrated across — both apps read and
write the same CSV format byte-for-byte, verified against a real 1960-entry export
(SHA-256 identical after export → import → export).

The design spec and implementation plan for this app live under `design/` in the local
working tree and are deliberately not published to the remote — this repository is
public and design documents are not committed. See `.gitignore`. Do not write
documentation that links to them as though a reader could follow it. Four deliberate
amendments were made to the spec during implementation:

1. The date type is `JournalDate`, not `Date` — the JS built-in is used constantly
   (`now(): Date`), and shadowing it inside a file that also calls `new Date()` is a
   footgun.
2. `Store` gained `close()`, needed by both the storage contract suite and `App.tsx`.
3. `SqliteStore` is written against a four-method `SqlDatabase` interface rather than
   `expo-sqlite` directly. `expo-sqlite` has no Node build, so without that seam the
   store contract could only run against a mock, defeating the point of having one. The
   interface is implemented by `expo-sqlite` on device and by Node's built-in
   `node:sqlite` in tests — the same seam is what makes `SqliteStore`'s atomicity
   fault-injection tests possible.
4. `design/` is gitignored rather than committed, reversing the spec's own
   recommendation — see above.

## The toolchain

Pinned in [`mise.toml`](mise.toml) — `mise install` after cloning. Install tools through
`mise`, not a system package manager or a global `npm -g`. Add a tool with
`mise use <tool>@<version>`, which installs it *and* records it in `mise.toml` in one
step; do not hand-write that file.

## Commands

```bash
make check          # tsc --noEmit && jest — the gate before any commit
make test           # jest
make start          # Expo dev server; scan the QR code with Expo Go
make web            # browser build, the no-device iteration story
make android        # Expo dev server, opening on a connected device
```

Or without `make`:

```bash
npm run check
npx jest src/domain/date.test.ts   # single test file
```

## Architecture

Layered, dependencies pointing inward. `src/screens` and `src/csv` depend on
`src/domain`; `SqliteStore` and `IndexedDbStore` implement `src/domain`'s `Store`;
nothing imports from `src/screens` except `App.tsx`.

| Directory | Role |
|---|---|
| `src/domain` | Domain only: `JournalDate`, `Entry`, the `Store` interface, `computeStats`. Imports nothing external — no React, no Expo — which is why it runs in a plain Node Jest environment. |
| `src/storage` | `SqliteStore` (Android, via `expo-sqlite`/`node:sqlite`) and `IndexedDbStore` (web), held to one shared behavioural contract (`storeContract.ts`) run against both — the same role `internal/storetest` plays for the legacy app. |
| `src/csv` | Import and export against a `Store`, byte-compatible with `legacy-fyne/internal/csvio`. |
| `src/screens` | Write, Memories, Settings (stats and import/export combined). |
| `src/platform` | The two things that genuinely differ per target: file access (`files.native.ts`/`files.web.ts`) and dialogs (`confirm.native.ts`/`confirm.web.ts`). React Native's `Alert` is a silent no-op on `react-native-web`, which is why dialogs need a platform split at all. |
| `App.tsx` / `JournalContext.tsx` | Store bootstrap, the error screen, and the cross-screen wiring: a `revision` counter every write path bumps, and an `onSaved` callback the Write screen fires that `App.tsx` turns into "reveal Memories" — the same role `app.go`'s `refreshDerived()`/`OnSaved` wiring plays for the legacy app. |

### Invariants worth not breaking

- **A date is a string, `"YYYY-MM-DD"`, always zero-padded.** Construct only via
  `parseDate`, `today`, or `addDays`. The padding is load-bearing: lexicographic order is
  chronological order, which is why neither storage backend needs a secondary index.
- **All date arithmetic happens in UTC**, so a local DST transition can never add or drop
  a day. `today()` is the one deliberate exception — it reads *local* calendar fields, so
  the diary agrees with the wall clock in the room. Timestamps are RFC3339 UTC with no
  fractional seconds, in both storage and CSV.
- **Stats are always derived, never stored.** `computeStats(dates, today)` from the date
  set alone. Grace rule: an unwritten *today* does not end the streak, an unwritten
  *yesterday* does.
- **Import is all-or-nothing.** The whole file parses and validates first, then one
  `putAll`. Invalid rows are counted and reported per row (1-based, counting the header,
  so the number matches what a spreadsheet shows) but never abort the import. `putAll` is
  transactional in both backends — `SqliteStore` wraps it in `BEGIN`/`COMMIT`/`ROLLBACK`;
  `IndexedDbStore` calls `tx.abort()` on a synchronous `put()` failure, since IndexedDB's
  `put()` throws synchronously on a malformed value and queued writes would otherwise
  still commit.
- **Nothing crashes on a user's device.** `Store` methods reject with errors; screens
  surface them with `notify()`, never let one propagate. A failed database open renders
  an error screen, not a blank app. A cancelled file picker is not an error.
- **Android ships zero permissions**, matching `legacy-fyne/`. `app.json` sets
  `android.permissions: []`, but that is an allowlist — `expo-sqlite`, `expo-sharing`,
  `expo-document-picker` and `expo-file-system` all contribute config plugins that can
  inject permissions at prebuild time regardless. The five they do inject
  (`INTERNET`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW`,
  `VIBRATE`) are listed in `android.blockedPermissions`. Verify any real build with
  `aapt dump permissions <apk>` — `tools:node="remove"` in the merged manifest is the
  correct directive, but only Gradle's manifest merger actually applies it.
- Out of scope by design: notifications, full-text search, calendar picker or archive
  list, future-dated entries, more than one entry per day.

### Testing gotchas specific to this stack

- **The Jest `logic` project is pinned to `TZ=America/Los_Angeles`** in `jest.config.js`
  — a negative UTC offset, chosen deliberately. Under a *positive* offset, midnight UTC
  never rolls the local calendar date backward, so a function that wrongly read local
  fields instead of UTC ones would still produce correct output and the test would pass
  on a broken implementation. Do not "fix" this pin to UTC or to a positive offset.
- **In screen tests, `await` every `fireEvent` that changes state, and `await render`.**
  With this project's versions of `react`/`react-test-renderer`/`@testing-library/react-native`,
  an un-awaited `fireEvent` overlaps the `act()` scope of whatever follows it and
  corrupts React's act bookkeeping — every later `render()` in that file then silently
  produces an **empty tree**, surfacing as confusing "element not found" failures
  unrelated to the component under test.
- **A class instance cannot be spread to build a partial fake.** `{ ...store, get: fn }`
  copies only own enumerable fields, not prototype methods, so a `SqliteStore`'s other
  methods come back `undefined` at runtime while type-checking fine. Bind explicitly per
  method instead.

## Testing

TDD throughout: failing test first, watch it fail, then implement.

- `src/domain` — table-driven pure logic (month/year/leap boundaries, streak rules, DST).
- Store implementations — add cases to the shared `storeContract.ts`, never to one
  store's own test file; running one suite against both is what stops `IndexedDbStore`
  from diverging from `SqliteStore`'s behaviour. Atomicity specifically cannot be proven
  by the shared contract (forcing a mid-batch failure is backend-specific), so each
  backend has its own fault-injection test (`SqliteStore.test.ts`,
  `IndexedDbStore.test.ts`).
- `src/csv` — round-trip identity (export → import into empty → export is
  byte-identical), skip vs overwrite, malformed rows, embedded newlines/quotes, BOM,
  in-file duplicate dates, atomicity, and CR/CRLF handling verified against real Go's
  `encoding/csv` rather than assumed.
- `src/screens` — React Native Testing Library; assert behaviour (which tab is active,
  which date loaded, whether the discard prompt fired), not snapshots.

## Data

The database is `journal.db`: `SqliteStore` on Android (via `expo-sqlite`), IndexedDB in
the browser. On Android, uninstalling deletes it; in the browser, clearing site data
does. `tools/convert-legacy-backup.py` converts an old `timestamp,body` export into the
`date,body,created,updated` CSV both apps' importers want, applying the
after-midnight-belongs-to-yesterday rule.

## Assets

The app icon is a flat re-draw of `legacy-fyne/icon.svg`'s stacked-date-cards concept —
solid colors, no gradients or blurred drop shadows, so the layered edges stay crisp at
small sizes and through Android's adaptive-icon squircle crop. `assets/icon.svg` is the
editable source (full-bleed, artwork centered in the safe zone); `assets/icon-foreground.svg`
and `assets/icon-monochrome.svg` are the split layers Android's adaptive icon needs — the
background is a flat `backgroundColor` in `app.json`, not an image. As with the legacy
icon, the numeral is an outlined path rather than `<text>`, produced the same way: write
the digits as real `<text>`, then let a tool bake in the font so the file renders
identically on a machine without it —
`inkscape text.svg --export-text-to-path --export-plain-svg --export-filename=text-path.svg`
(source font: Liberation Sans Bold) — and hand-copy the resulting `<path>` into place.
`icon-monochrome.svg` punches the numeral out of the card stack as negative space (an SVG
`<mask>`) rather than drawing it on top, since Android tints the whole monochrome layer a
single color and a same-color numeral would otherwise vanish into the card behind it.

Regenerate every raster asset from the three source SVGs after any artwork change:

```bash
cd assets
rsvg-convert -w 1024 -h 1024 icon.svg -o icon.png
rsvg-convert -w 1024 -h 1024 icon.svg -o splash-icon.png
rsvg-convert -w 1024 -h 1024 icon-foreground.svg -o android-icon-foreground.png
rsvg-convert -w 1024 -h 1024 icon-monochrome.svg -o android-icon-monochrome.png
rsvg-convert -w 48 -h 48 icon.svg -o favicon.png
```

---

## The legacy Fyne implementation (`legacy-fyne/`)

The original Go + Fyne + bbolt implementation. Kept working, with a live release
pipeline, until the React Native app above reaches parity and real diary data has been
migrated. Its own `README.md` and this section cover everything specific to it; nothing
above applies to it except the CSV format, which both apps share byte-for-byte.

### Commands

```bash
make legacy-check          # gofmt + go vet + go test — from the repository root
make legacy-run            # real desktop window (needs GL/X libs; make -C legacy-fyne deps reports gaps)
make legacy-run-headless   # full startup path, software driver, exits immediately
make legacy-apk            # Android package (needs fyne CLI + ANDROID_HOME/ANDROID_NDK_HOME)
```

Or `cd legacy-fyne` and use its own `Makefile` directly — see
[`legacy-fyne/README.md`](legacy-fyne/README.md).

`TAGS` defaults to `ci`, which selects Fyne's software driver so every target works on a
headless machine. Only `cmd/remindiary` needs the tag — it is the one package that pulls
in a driver; the test suite is headless either way. To exercise the real GLFW desktop
driver: `make -C legacy-fyne check TAGS=`.

### Architecture

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

`journal.Date` is a string, `"2006-01-02"`, always zero-padded, for the same
lexicographic-order reason as the React Native app's `JournalDate`. All date arithmetic
happens in UTC (`Date.Time()` returns midnight UTC). Stats are derived, never stored,
with the same grace rule. Import is all-or-nothing. Nothing panics: the UI surfaces
errors with `dialog.ShowError`. Dependencies are exactly `fyne.io/fyne/v2` and
`go.etcd.io/bbolt`.

Each screen is a struct with `NewX(store, [win,] now)`, a `Content() fyne.CanvasObject`,
and — for the derived screens — a `Refresh() error`. Screens never reach across to each
other: they expose callbacks (`Write.OnSaved`, `Data.OnImported`) that `app.go` wires to
`reload()` / `refreshDerived()`. `now func() time.Time` is injected everywhere rather
than calling `time.Now`, so tests can pin "today". `FyneApp.toml` sets `fyneDo = true`,
declaring that every UI call is already on the main goroutine — keep it that way.

### Testing

Same TDD discipline as the React Native app: `journal` is table-driven pure logic; store
implementations add cases to `storetest.Run`, never to one store's own test file; `csvio`
covers round-trip identity, skip vs overwrite, malformed rows, atomicity; `ui` uses
`test.NewApp()` smoke tests over `memstore`, asserting behaviour rather than pixels.

### Assets

`icon.png` (512×512, full-bleed, no alpha) is a committed asset, not a build product —
there is no generator target and nothing regenerates it. `icon.svg` beside it is the
editable source; re-export with `rsvg-convert -w 1024 -h 1024 icon.svg -o /tmp/i.png &&
magick /tmp/i.png -resize 512x512 -strip icon.png` if you change it. The numeral is an
outlined path rather than `<text>` so the SVG renders identically without fonts. Keep the
artwork inside the centre of the canvas: Android's adaptive-icon mask crops to a circle or
squircle, and the full-bleed background is what gives it something to crop.
