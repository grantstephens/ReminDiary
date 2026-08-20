# ReminDiary

A daily journal for Android. Write today's entry; saving it reveals what you
wrote on the same day in previous years. Everything is stored locally in bbolt,
and CSV import/export keeps the data yours.

## Development

`make` lists every target:

```bash
make check   # gofmt, go vet, go test
make run     # desktop window
make apk     # Android package
```

`make apk` builds a debug package with all four ABIs, which is about 122MB — fine for an
emulator, wasteful for a phone. For a real device:

```bash
make apk RELEASE=1 ABI=arm64   # ~25MB
```

Dropping the unused ABIs is what shrinks it; `--release` alone only saves about 19%. The
build needs the `fyne` CLI plus `ANDROID_HOME` and `ANDROID_NDK_HOME`.

### Releasing to Google Play

`make apk` is for sideloading. It targets SDK 29, which Play rejects — and `--release`
does not change that, because fyne gates the SDK 35 target on `fyne release` rather than
`fyne package`. For a Play-ready signed bundle:

```bash
make release KEYSTORE=~/keys/remindiary.keystore KEY_NAME=remindiary
```

That needs [`bundletool`](https://developer.android.com/tools/bundletool) on PATH and a
keystore you generate once and never lose — Play ties the app identity to it permanently:

```bash
keytool -genkeypair -keystore remindiary.keystore -alias remindiary \
        -keyalg RSA -keysize 2048 -validity 10000
```

Keep it outside the repo. Passwords are prompted for on stdin rather than passed as
variables, so they stay out of your shell history. Do not set `ABI` for a release build:
the bundle should carry every ABI and let Play split it per device.

## Installing

Releases are published as signed APKs on the
[Releases page](https://github.com/grantstephens/ReminDiary/releases). Download and
sideload the APK directly, or point [Obtainium](https://github.com/ImranR98/Obtainium)
at this repository and it will track and install updates automatically.

## Publishing a release

Tagging builds and publishes automatically — see `.github/workflows/release.yml`:

```bash
git tag v1.0.1 && git push origin v1.0.1
```

The workflow runs `make check`, builds an all-ABI APK, re-signs it with the project's
release key and attaches it to a GitHub Release. `versionName` comes from the tag;
`versionCode` comes from the workflow run number, so it always increases — Android
refuses to upgrade an installed app otherwise.

### One-time signing setup

Android identifies an app by its signing certificate. Every release must use the *same*
key, or existing users cannot upgrade and would have to uninstall, losing their journal.
Generate it once, back it up, never commit it:

```bash
keytool -genkeypair -v -keystore remindiary.keystore -alias remindiary \
        -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 remindiary.keystore    # value for ANDROID_KEYSTORE_BASE64
```

Then set four repository secrets:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64 of the `.keystore` file |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias (`remindiary` above) |
| `ANDROID_KEY_PASSWORD` | key password |

```bash
gh secret set ANDROID_KEYSTORE_BASE64 < <(base64 -w0 remindiary.keystore)
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS
gh secret set ANDROID_KEY_PASSWORD
```

The desktop build exists so iteration does not need a device. Android is the
shipping target.

### Headless machines

The default desktop build links GLFW and needs the GL, X and xkb development
libraries (`libxkbcommon`, `libxrandr`, `libxinerama`, `libxi` on Arch). On a
server without them, build and test against Fyne's software driver instead:

```bash
go vet -tags ci ./...
go test -tags ci ./...
go build -tags ci ./...
```

The Makefile passes that tag by default, so `make check` works on a bare server
with no display stack. `make deps` reports which libraries are missing, and
`make run-headless` exercises the whole startup path without opening a window.
To build against the real desktop driver instead, clear the tag: `make check TAGS=`.

The whole test suite is headless either way — the `ci` tag is only needed to
compile `cmd/remindiary`, which is the one package that pulls in a driver.

## Packaging for Android

Requires the Android SDK and NDK, with `ANDROID_HOME` and `ANDROID_NDK_HOME`
set, plus the Fyne CLI:

```bash
go install fyne.io/tools/cmd/fyne@latest
make apk
```

`make install` builds the APK and pushes it to a connected device with `adb`.

The launcher icon is `icon.png`, a committed asset that `fyne package` picks up via
`FyneApp.toml`. `icon.svg` is its editable source; nothing regenerates the PNG
automatically.

## Data

The database lives in the app's private storage as `journal.db`. Use the Data
tab to export a CSV backup; import merges a CSV back in, skipping dates you
already have unless you tick "Overwrite existing entries".

## CSV format

```
date,body,created,updated
2026-08-19,"Multi-line bodies work fine, quotes and commas too",2026-08-19T18:42:00Z,2026-08-19T18:42:00Z
```

`created` and `updated` are optional on import.
