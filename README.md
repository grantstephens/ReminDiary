# ReminDiary

A daily journal for Android that shows you your own past. Write today's entry, save it,
and the app surfaces what you wrote on this same date in previous years.

Everything lives on your phone. No account, no sync, no telemetry: ReminDiary contains no
networking code whatsoever. Your entries are yours, and CSV export means they stay that
way even if you stop using this.

> **On permissions:** the APK declares `INTERNET`, `READ_EXTERNAL_STORAGE` and
> `WRITE_EXTERNAL_STORAGE`. None of these are used by ReminDiary — they are boilerplate
> from Fyne's default Android manifest template, which every Fyne app inherits. Verify
> for yourself: there is no `net/http` import anywhere in the source.

[![Licence: GPL v3](https://img.shields.io/badge/Licence-GPLv3-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/grantstephens/ReminDiary?include_prereleases)](https://github.com/grantstephens/ReminDiary/releases)

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

Requires Android 5.0 (API 21) or later. The APK carries all four ABIs, so it works on any
phone or emulator.

> **Upgrading from a locally built APK?** Android identifies an app by its signing
> certificate, so a release build will not install over one you built yourself. Export
> your entries from the **Data** tab first, uninstall, then install the release —
> uninstalling deletes the database.

## Using it

Four tabs:

- **Write** — today's entry, one per calendar date. Saving reveals your Memories.
- **Memories** — what you wrote on this date in previous years, newest first, labelled
  "1 year ago", "2 years ago" and so on. Empty until you have a year of history.
- **Stats** — current streak, longest streak, total entries, and the date you started.
  An unwritten *today* does not break your streak; an unwritten *yesterday* does.
- **Data** — CSV export and import.

There is deliberately no search, no calendar picker, no notifications and no future-dated
entries. It is a journal, not an organiser.

### Your data

The database is `journal.db` in Android's app-private storage, which means **uninstalling
the app deletes your entries**. Export from the **Data** tab before you uninstall, switch
phones, or do anything else drastic.

Import merges a CSV back in, skipping dates you already have unless you tick *Overwrite
existing entries*. Imports are all-or-nothing: the whole file is parsed and validated
before anything is written, so a malformed row cannot leave you half-imported.

### CSV format

```csv
date,body,created,updated
2026-08-19,"Multi-line bodies work fine, quotes and commas too",2026-08-19T18:42:00Z,2026-08-19T18:42:00Z
```

`created` and `updated` are optional on import. Dates are `YYYY-MM-DD`; timestamps are
RFC 3339 in UTC.

## Development

Go 1.26, [Fyne](https://fyne.io) and [bbolt](https://github.com/etcd-io/bbolt). Those two
are the only dependencies, and adding a third is a decision rather than a convenience.

```bash
make            # list every target
make check      # gofmt + go vet + go test — the gate before any commit
make run        # desktop window
make apk        # Android package
```

Android is the shipping target; the desktop build exists so that iterating does not need
a device.

### Headless machines

`TAGS` defaults to `ci`, which selects Fyne's software driver, so every target works on a
server with no display stack. `make deps` reports which GL/X libraries are missing for a
real desktop window, and `make run-headless` exercises the whole startup path without
opening one. To build against the real GLFW driver instead, clear the tag:

```bash
make check TAGS=
```

The test suite is headless either way — the tag is only needed to compile
`cmd/remindiary`, the one package that pulls in a driver.

### Building an APK

Needs the [Fyne CLI](https://github.com/fyne-io/tools) plus `ANDROID_HOME` and
`ANDROID_NDK_HOME`:

```bash
go install fyne.io/tools/cmd/fyne@latest
make apk                        # all four ABIs, debug, ~122MB
make apk RELEASE=1 ABI=arm64    # one ABI, ~25MB — what a real phone needs
make install                    # build and push to a connected device via adb
```

Dropping the unused ABIs is what shrinks the package; `RELEASE=1` alone only saves about
19%, since it just strips DWARF.

## Releasing

Pushing a tag builds, signs and publishes automatically — see
[`.github/workflows/release.yml`](.github/workflows/release.yml):

```bash
git tag v1.0.0 && git push origin v1.0.0
```

The workflow runs the test suite, builds an all-ABI APK, re-signs it with the project's
release key and attaches it to a GitHub Release. Tags carrying a semver pre-release
suffix (`v1.0.0-beta.1`) are published as pre-releases.

`versionName` comes from the tag. `versionCode` comes from the workflow run number, so it
always increases — Android refuses to upgrade an installed app otherwise.

### Signing setup

Android identifies an app by its signing certificate. Every release must use the *same*
key, or existing users cannot upgrade and would have to uninstall, losing their journal.
Generate it once, back it up somewhere you trust, and never commit it:

```bash
keytool -genkeypair -v -keystore remindiary.keystore -storetype PKCS12 \
        -alias remindiary -keyalg RSA -keysize 4096 -validity 10000
```

Then set four repository secrets:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64 of the `.keystore` file |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias (`remindiary` above) |
| `ANDROID_KEY_PASSWORD` | key password |

```bash
base64 -w0 remindiary.keystore | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS
gh secret set ANDROID_KEY_PASSWORD
```

### Google Play

`make apk` targets SDK 29, which Play rejects, and `--release` does not change that —
Fyne gates the SDK 35 target on `fyne release` rather than `fyne package`. For a
Play-ready signed bundle you also need [`bundletool`](https://developer.android.com/tools/bundletool):

```bash
make release KEYSTORE=~/keys/remindiary.keystore KEY_NAME=remindiary
```

Passwords are prompted for on stdin rather than passed as variables, so they stay out of
your shell history. Do not set `ABI` for a release bundle: it should carry every ABI and
let Play split it per device.

## Licence

[GPL-3.0-or-later](LICENSE). If you distribute a modified version, you must publish your
changes under the same licence.
