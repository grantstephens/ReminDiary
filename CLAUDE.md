@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An offline daily journal (React Native + Expo). One entry per calendar date; saving
today's entry reveals what you wrote on the same day in previous years. Android and the
web are both shipping targets.

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
| `src/storage` | `SqliteStore` (Android, via `expo-sqlite`/`node:sqlite`) and `IndexedDbStore` (web), held to one shared behavioural contract (`storeContract.ts`) run against both. |
| `src/csv` | Import and export against a `Store`: `date,body,created,updated`. |
| `src/screens` | Write, Memories, Settings (stats and import/export combined). |
| `src/platform` | The things that genuinely differ per target: file access (`files.*`), dialogs (`confirm.*` — React Native's `Alert` is a silent no-op on `react-native-web`), app-backgrounding signals (`lifecycle.*`), and the light/dark override (`themePreference.*`, native-only — see below). |
| `src/theme.ts`, `src/ThemeContext.tsx` | Colors. `theme.ts` is the two palettes (light/dark), pure data. `ThemeContext`'s `ThemeProvider`/`useTheme()` follows the system color scheme by default, or a stored override from `platform/themePreference` — native-only by design; on web it always resolves to the light theme and never touches the preference file, so web keeps the appearance it always had. |
| `App.tsx` / `JournalContext.tsx` | Store bootstrap, the error screen, and the cross-screen wiring: a `revision` counter every write path bumps, and an `onSaved` callback the Write screen fires that `App.tsx` turns into "reveal Memories". |

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
- **Android ships zero permissions.** `app.json` sets
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
`date,body,created,updated` CSV the importer wants, applying the after-midnight-belongs-
to-yesterday rule.

## Assets

The app icon is a flat stacked-date-cards design — solid colors, no gradients or blurred
drop shadows, so the layered edges stay crisp at small sizes and through Android's
adaptive-icon squircle crop. `assets/icon.svg` is the
editable source (full-bleed, artwork centered in the safe zone); `assets/icon-foreground.svg`
and `assets/icon-monochrome.svg` are the split layers Android's adaptive icon needs — the
background is a flat `backgroundColor` in `app.json`, not an image. The numeral is an
outlined path rather than `<text>`, produced by writing the digits as real `<text>` and
letting a tool bake in the font so the file renders identically on a machine without it —
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

