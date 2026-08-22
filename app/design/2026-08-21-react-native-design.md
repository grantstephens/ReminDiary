# ReminDiary — React Native Fresh Implementation — Design

**Date:** 2026-08-21
**Status:** Approved

## Purpose

A fresh implementation of ReminDiary — the same daily journal described in
`docs/superpowers/specs/2026-08-19-remindiary-design.md` — on React Native
instead of Go/Fyne.

## Why this exists

The Fyne/Android build's text editor is broken at the architecture level: Fyne
doesn't hand text input to a real Android `EditText`. It keeps a throwaway,
invisible `EditText` around purely to catch keystrokes for the IME (permanently
holding a single dummy space character) and relays them to Go, which draws the
visible text, cursor, and selection entirely itself. That's why the on-screen
keyboard sizes oddly and copy/paste doesn't feel native — the widget the user
actually types into isn't the one the OS keyboard thinks it's talking to. This
is a confirmed, long-standing category of upstream Fyne-on-Android bugs
(fyne-io/fyne#2371, #5258, #5259, #5467, #1562), not something fixable in
ReminDiary's own code.

React Native's `TextInput` wraps the real native widget — `EditText` on
Android, a real DOM `<textarea>`/`<input>` via `react-native-web` on the
browser build. Writing is this app's entire reason to exist, so the text
editor being second-class is worth a fresh implementation to fix.

## Scope

Same product scope as the existing spec — this is a platform change, not a
feature change:

- Write and edit one entry per calendar date, navigating day-by-day with
  arrows
- "On This Day" view of the same month-day from previous years
- Streak and writing statistics
- CSV import (skip-or-overwrite) and export

Explicitly out of scope, same as before: notifications, full-text search, an
archive list or calendar picker, multiple entries per day, titles, tags,
attachments, sync, accounts, encryption.

## Platforms

**v1 targets: Android and Web only.** Android remains the daily-driver
shipping target; Web replaces Fyne's desktop build as the no-device iteration
story (and doubles as a real deployable web app, unlike the old desktop
build). iOS, Windows, and macOS are explicitly deferred — nothing in this
design blocks adding them later, but none of them gate v1.

**Toolchain: Expo**, not bare React Native CLI. Expo Go gives on-device
iteration by scanning a QR code — no Gradle build cycle to change one line of
UI, which is the actual fix to today's slow iteration pain, not just the text
widget. Expo's Android and Web support are first-class and cover 100% of v1's
platform list. Bare RN's extra native-project control isn't needed by
anything in this app's feature list. If Windows/macOS are ever added, the
project can eject to bare RN or add `react-native-windows`/`react-native-macos`
at that point — that decision is deferred, not foreclosed.

## Repository

Lives in this repo, in a new `app/` directory, on the `react-native-app`
branch, alongside the existing Go implementation. The Go app keeps working
and keeps shipping updates until the React Native app reaches parity.
Migration of real diary data happens later, via CSV: export from the Go app
(already implemented), import into the new app (built as part of this app's
own v1 scope) — no bespoke migration tooling needed, since both apps speak
the same CSV format by design (see Data model below). The Go code is deleted
only once the cutover is final; no fixed date for that yet.

`docs/` is gitignored repo-wide (existing convention — the Go app's design
docs are intentionally not published). This spec and its implementation plan
live under `app/design/` instead, specifically so they're committed with the
rest of this effort.

## Architecture

Same layering principle as the Go app: storage sits behind an interface so
domain logic and screens are tested without a real database or an emulator.

```
app/
  src/
    domain/       Date, Entry, Store interface, computeStats() — pure TS, no RN imports
    storage/
      SqliteStore.ts      Store impl backed by expo-sqlite (native)
      IndexedDbStore.ts   Store impl backed by IndexedDB (web)
      storeContract.test.ts   one Jest suite, run against both implementations
    csv/           import.ts, export.ts — against a Store, format-compatible with csvio
    screens/       Write.tsx, Memories.tsx, Stats.tsx, Data.tsx
    App.tsx         navigation wiring (React Navigation, bottom tabs)
```

Dependencies point inward, same rule as `internal/`: `screens` and `csv`
depend on `domain`; `SqliteStore`/`IndexedDbStore` implement `domain`'s
`Store`; nothing depends on `screens`.

### Why two storage implementations, not one

`expo-sqlite` has web support, but it requires WASM plus
`Cross-Origin-Embedder-Policy`/`Cross-Origin-Opener-Policy` headers on
whatever serves the web build, and has open stability issues as of late
2025 (expo/expo#39903). Chasing that buys nothing this app needs — every
query this app makes (get by date key, list all dates, filter by
month-day suffix) is trivially served by a key-value store, no real SQL
required. So, matching the Go app's own `boltstore`/`memstore` split: a
real embedded database on native (`expo-sqlite`, mature, no WASM tricks),
a plain key-value store on web (`IndexedDB`, mature, zero header
configuration). One shared Jest contract suite (`storeContract.test.ts`)
runs against both, playing the same role `internal/storetest` plays today
— it's what stops the web implementation from quietly drifting from the
native one.

## Data model

```typescript
// Date is an ISO-8601 calendar date, "YYYY-MM-DD", always zero-padded.
// Construct only via parseDate, today, or addDays — never a raw string
// literal at a call site. Lexicographic order is chronological order,
// same invariant as Go's journal.Date, for the same reason: it's what lets
// IndexedDB key ranges and SQL string ordering both do chronological
// walks without a secondary index.
type Date = string;

interface Entry {
  date: Date;
  body: string;
  created: string; // RFC3339 UTC
  updated: string; // RFC3339 UTC
}
```

All date arithmetic happens in UTC, so a local DST transition can never add
or drop a day — same rule as the Go app's `Date.Time()`.

### Store interface

```typescript
interface Store {
  get(date: Date): Promise<Entry | null>;
  put(entry: Entry): Promise<void>;
  putAll(entries: Entry[]): Promise<void>; // atomic: all land or none do
  delete(date: Date): Promise<void>;
  onThisDay(month: number, day: number): Promise<Entry[]>; // every year present, newest first
  dates(): Promise<Date[]>; // chronological
  all(): AsyncIterable<Entry>; // chronological, for export
}
```

Semantics carried over unchanged from `journal.Store`: `onThisDay` returns
every year present including the current year (filtering "today" out is the
Memories screen's job, same as before); `putAll` is the only way import
writes, so a half-valid CSV can't half-land; `all()` stops early if the
consumer's iteration stops, mirroring the Go version's yield-error
short-circuit.

### Statistics

Computed on demand from `dates()`, never stored — current streak (with the
"today blank doesn't end it, yesterday blank does" grace rule), longest
streak, total entries, writing-since date. Identical rules to
`journal.ComputeStats`.

## Screens and flow

Four screens, React Navigation bottom tabs (thumb-reachable on a phone,
unobtrusive on Web) in place of Fyne's `container.NewAppTabs`.

### Write (home tab)

Day-stepping arrows around a header; a multiline `TextInput` filling the
screen; a Save button. Forward arrow disabled when the displayed date is
today — future-dated entries stay unsupported. Navigating away with unsaved
changes prompts "Discard changes?" first.

Save semantics, unchanged: non-empty body writes the entry (`created`
preserved on an edit, `updated` always set to now); empty body on a date
that already has an entry prompts "Delete this entry?"; empty body on a
blank date is a no-op, so blank dates never appear in an export. A
successful save switches to the Memories tab — same soft-gate ritual as
today.

### Memories (On This Day)

Every previous year with an entry for this month-day, newest first, each
under a relative year label ("9 years ago"). No limit, no "show more".
Read-only — editing a past entry means walking to it with the Write tab's
arrows. Leap day matches exactly: an entry on 29 Feb appears only on 29 Feb,
never bleeding into 28 Feb in a non-leap year. Empty state: "Nothing from
previous years yet. Come back next 19 August." (the displayed date interpolated
in, matching the current app's copy).

### Stats

Current streak, longest streak, total entries, writing since.

### Data

Import CSV and Export CSV.

## CSV format

Unchanged from the existing spec, byte-for-byte compatible so the Go app's
export is a valid import here with no translation step:

```
date,body,created,updated
2026-08-19,"Multi-line bodies work fine,
quotes and commas too",2026-08-19T18:42:00Z,2026-08-19T18:42:00Z
```

RFC 4180, header row required (`date`, `body` required; unknown columns
rejected by name, not silently ignored), UTF-8 BOM stripped before parsing.
`created`/`updated` optional on import (filled with now when absent),
always written on export.

Import parses and validates the entire file into memory first, then applies
every valid row through one `putAll` — the import either lands completely or
not at all. Rows failing validation are collected and reported by row number
(1-based, counting the header) without aborting the import. Conflict
handling: existing dates are skipped by default; an "Overwrite existing
entries" checkbox, off by default, makes imported rows win, gated by one
confirmation.

Export streams all entries chronologically to a downloaded/saved file,
default name `remindiary-YYYY-MM-DD.csv`. On native this goes through
`expo-file-system` + a share/save sheet; on web, a browser download — both
are thin platform-specific writers behind the same `csv/export.ts`, which
never assumes a real filesystem path exists (same discipline as the Go
app's `fyne.URIWriteCloser` rule, for the same reason: it doesn't on every
target).

## Error handling

- `Store` methods reject with errors; screens surface them as an alert/toast,
  never let one propagate into a crash.
- A failed database open at startup renders an error screen, not a blank/
  crashed app.
- A cancelled file picker is not an error and produces no dialog.
- Import and export errors name the row or the operation that failed.

## Testing

Test-driven, same order as the Go app: failing test, watch it fail, then
implement.

- **`domain`** — Jest, table-driven: date parsing/formatting, `addDays`
  across month/year/leap boundaries, the streak grace rule, longest-streak
  runs, DST-safe local-date derivation. Ports near-verbatim from
  `journal`'s test table.
- **`storage`** — `storeContract.test.ts` runs against both `SqliteStore`
  and `IndexedDbStore`, same role as `internal/storetest`.
- **`csv`** — round-trip identity (export → import into empty → export is
  byte-identical), skip vs. overwrite, malformed rows, embedded
  newlines/quotes, BOM, in-file duplicate dates, atomicity.
- **`screens`** — React Native Testing Library: assert behavior (which tab
  is active, which date loaded, whether the discard prompt fired), not
  snapshots — same rule as today's `ui` tests.

## Build and dev loop

Replaces `make check` / `make run` / `make apk`:

- `npx expo start` — on-device iteration via Expo Go, no build step. Fixes
  today's actual iteration pain, not just the text widget.
- `npx expo start --web` — browser build; this is the Linux desktop
  iteration story.
- `eas build -p android` (or a local Gradle build via `expo prebuild`) —
  produces a real installable APK, equivalent to `make apk`.
- `npx jest` — the `make check` equivalent gate; wired as an npm script.

## Explicitly deferred, not decided against

- iOS, Windows, macOS as shipping targets — nothing here blocks adding them;
  they're just not part of v1.
- The exact point at which the Go implementation is retired and this one
  becomes canonical — depends on when this app reaches feature parity and
  the real diary data is migrated.
