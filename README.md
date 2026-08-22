# ReminDiary

A daily journal for Android and the web that shows you your own past. Write today's
entry, save it, and the app surfaces what you wrote on this same date in previous years.

Everything lives on your device. No account, no sync, no telemetry: ReminDiary contains
no networking code whatsoever. Your entries are yours, and CSV export means they stay
that way even if you stop using this.

[![Licence: GPL v3](https://img.shields.io/badge/Licence-GPLv3-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/grantstephens/ReminDiary?include_prereleases)](https://github.com/grantstephens/ReminDiary/releases)

## What's here

This repository holds two implementations of the same app.

- **This directory (repository root)** — a [React Native](https://reactnative.dev)
  (Expo) implementation, targeting Android and the web. This is the primary
  implementation going forward.
- **[`legacy-fyne/`](legacy-fyne/)** — the original Go + Fyne implementation. It is
  kept working, and its release pipeline stays live, until this app reaches parity and
  the real diary data has been migrated across.

### Why React Native

Fyne's Android text editor is broken at the architecture level, not something fixable
from application code: it keeps a permanently-invisible dummy `EditText` around purely to
catch keystrokes for the IME, and draws the visible text, cursor and selection itself.
That is why the on-screen keyboard sizes oddly and copy/paste never feels native — the
widget you type into is not the one the OS keyboard thinks it is talking to. This is a
confirmed, long-standing category of upstream Fyne-on-Android bugs, not something this
app's own code can work around. React Native's `TextInput` wraps the real native widget —
`EditText` on Android, a real `<textarea>` on the web. Writing is this app's entire reason
to exist, so a second-class editor was worth a rewrite.

### Current status

The migration path is verified: exporting a real 1960-entry diary from the legacy app,
importing it here, and exporting again produces a byte-identical file (SHA-256 match).
CSV format, statistics, and every user-visible copy string match the legacy app exactly.

**Not yet verified:** on-device text editing (the entire reason this rewrite exists), the
browser build, and a signed release build. **The APKs currently published under
[Releases](https://github.com/grantstephens/ReminDiary/releases) are still built from
`legacy-fyne/`** — there is no React Native release yet.

## Installing

### With Obtainium (recommended)

[Obtainium](https://github.com/ImranR98/Obtainium) installs apps straight from GitHub and
keeps them updated, with no app store in the middle.

1. Install Obtainium.
2. Tap **Add App**.
3. Paste `https://github.com/grantstephens/ReminDiary`.
4. Turn on **Include prereleases** — the current builds are betas, and without this
   Obtainium will wait for a stable tag and find nothing.
5. Tap **Add**, then **Install**.

Obtainium will notify you when a new release is tagged.

### Directly

Download the APK from the [Releases page](https://github.com/grantstephens/ReminDiary/releases)
and open it. Android will warn you about installing from an unknown source, because the
app is signed with the project's own key rather than distributed through Play.

> **On permissions:** every release of this app, on either implementation, declares
> **no Android permissions at all**. Check any release for yourself with
> `aapt dump permissions <apk>` — the list is empty.

> **Upgrading from a locally built APK?** Android identifies an app by its signing
> certificate, so a release build will not install over one you built yourself. Export
> your entries from the Data screen first, uninstall, then install the release —
> uninstalling deletes the database.

## Using it

Four screens:

- **Write** — today's entry, one per calendar date. Saving reveals your Memories.
- **Memories** — what you wrote on this date in previous years, newest first, labelled
  "1 year ago", "2 years ago" and so on. Empty until you have a year of history.
- **Stats** — current streak, longest streak, total entries, and the date you started.
  An unwritten *today* does not break your streak; an unwritten *yesterday* does.
- **Data** — CSV export and import.

There is deliberately no search, no calendar picker, no notifications and no future-dated
entries. It is a journal, not an organiser.

### Your data

On Android the database lives in the app's private storage, so **uninstalling the app
deletes your entries**. Export from the Data screen before you uninstall, switch devices,
or do anything else drastic. On the web build, data lives in the browser's IndexedDB and
is subject to the same rule — clearing site data deletes it.

Import merges a CSV back in, skipping dates you already have unless you tick *Overwrite
existing entries*. Imports are all-or-nothing: the whole file is parsed and validated
before anything is written, so a malformed row cannot leave you half-imported.

### CSV format

```csv
date,body,created,updated
2026-08-19,"Multi-line bodies work fine, quotes and commas too",2026-08-19T18:42:00Z,2026-08-19T18:42:00Z
```

`created` and `updated` are optional on import. Dates are `YYYY-MM-DD`; timestamps are
RFC 3339 in UTC. This format is shared byte-for-byte with `legacy-fyne/`, so migrating
between the two implementations is a plain export/import — see below.

### Moving your diary from the legacy app

Export from `legacy-fyne/`'s Data tab, then import here (or the reverse). Both speak the
same CSV by design; no bespoke migration tool is needed.

## Development

Toolchain is pinned in [`mise.toml`](mise.toml) — run `mise install` after cloning, and
run project commands through it (`mise exec -- ...`), not through a system package
manager or a global `npm -g`. In a non-interactive shell, a bare `node`/`npm` resolves
mise's *global* install rather than this repository's pin, which has previously caused
real, silent test failures on this project.

```bash
make            # list every target
make check      # tsc --noEmit && jest — the gate before any commit
make start      # Expo dev server; scan the QR code with Expo Go
make web        # browser build, the no-device iteration story
make android    # Expo dev server, opening on a connected device
```

Android and the web are both shipping targets.

### Layout

```
src/domain/    pure TypeScript: dates, entries, the Store contract, stats
src/storage/   SqliteStore (Android) and IndexedDbStore (web), one shared contract
src/csv/       import and export, byte-compatible with legacy-fyne/
src/screens/   Write, Memories, Stats, Data
src/platform/  the two things that differ per target: files and dialogs
```

Dependencies point inward. `src/domain` imports nothing — no React, no Expo — which is
why it is tested in a plain Node environment.

### The legacy Fyne app

See [`legacy-fyne/README.md`](legacy-fyne/README.md) for its own build, test and release
instructions — they are unchanged from when it was the primary app. `make legacy-check`,
`make legacy-run` and `make legacy-apk` from the repository root delegate into it.

## Licence

[GPL-3.0-or-later](LICENSE). If you distribute a modified version, you must publish your
changes under the same licence.
