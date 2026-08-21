# ReminDiary (React Native)

A fresh implementation of ReminDiary on Expo, targeting Android and the web.
The Go/Fyne implementation in the repository root still ships; this one replaces
it once it reaches parity and the diary data has been migrated across by CSV.

The design spec and implementation plan are deliberately not in this repository;
they live in `app/design/`, which is gitignored, same as `docs/` at the root.

## Commands

    mise install       # the toolchain: node, go, eas-cli
    npm run check      # tsc --noEmit && jest — the gate before any commit
    npm test           # jest
    npm start          # Expo dev server; scan the QR code with Expo Go
    npm run web        # browser build, the no-device iteration story
    npm run android    # Expo dev server, opening on a connected device

## Layout

    src/domain/    pure TypeScript: dates, entries, the Store contract, stats
    src/storage/   SqliteStore (Android) and IndexedDbStore (web), one contract
    src/csv/       import and export, byte-compatible with the Go app
    src/screens/   Write, Memories, Stats, Data
    src/platform/  the two things that differ per target: files and dialogs

Dependencies point inward. `src/domain` imports nothing — no React, no Expo —
which is why it is tested in a plain Node environment.

## Moving your diary across

Export from the Go app, import here. Both speak the same CSV by design.
