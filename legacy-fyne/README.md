# ReminDiary — legacy Fyne implementation

This is the original Go + [Fyne](https://fyne.io) + [bbolt](https://github.com/etcd-io/bbolt)
implementation of ReminDiary. It has been superseded by the React Native app at the
repository root, built to fix a text-editing problem in Fyne's Android build that is not
fixable from application code — see the repository root [`README.md`](../README.md) and
[`CLAUDE.md`](../CLAUDE.md) for why.

This app is kept working, and its release pipeline stays live, until the React Native app
reaches parity and the real diary data has been migrated across by CSV — both apps read
and write the same CSV format byte-for-byte, so that migration is a plain export/import,
not a bespoke tool.

Everything below is unchanged from when this was the primary app: the build, the test
suite, and the signed-release pipeline all still work exactly as documented.

> **On permissions:** this app declares **no Android permissions at all**. Fyne's default
> manifest template adds `INTERNET` and both external-storage permissions to every app
> built with it, so the project ships its own manifest
> ([`AndroidManifest.xml.in`](cmd/remindiary/AndroidManifest.xml.in)) that declares none.
> Check any release for yourself with `aapt dump permissions <apk>` — the list is empty.

## Development

Go 1.26, Fyne and bbolt. Those two are the only dependencies, and adding a third was
always a decision rather than a convenience.

From the repository root:

```bash
make legacy-check         # gofmt + go vet + go test — the gate before any commit
make legacy-run           # desktop window
make legacy-apk           # Android package
```

Or from this directory directly:

```bash
make            # list every target
make check      # gofmt + go vet + go test
make run        # desktop window
make apk        # Android package
```

Android is the shipping target for this app; the desktop build exists so that iterating
does not need a device.

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

`make apk` is for development. It targets SDK 29, so Android shows a "built for an older
version of Android" warning on install — Fyne only emits SDK 35 on the `fyne release`
path. Published releases go through `make release` and do not have that problem.

Both targets generate `cmd/remindiary/AndroidManifest.xml` from
`AndroidManifest.xml.in`, substituting `VERSION_CODE` and `VERSION_NAME`. Fyne uses a
hand-written manifest verbatim when one is present, which is how the permissions get
dropped — but it also means Fyne's `--app-version`/`--app-build` flags are ignored, hence
the substitution.

## Releasing

Pushing a tag builds, signs and publishes automatically — see
[`../.github/workflows/legacy-fyne-release.yml`](../.github/workflows/legacy-fyne-release.yml):

```bash
git tag v1.0.0 && git push origin v1.0.0
```

The workflow runs the test suite, builds a signed all-ABI bundle with `fyne release`,
flattens it into a universal APK, asserts the result targets SDK 35 and declares zero
permissions, and attaches both the `.apk` and the `.aab` to a GitHub Release. Tags
carrying a semver pre-release suffix (`v1.0.0-beta.1`) are published as pre-releases.

`versionName` is the tag without its leading `v`. `versionCode` is packed from the same
tag as `major*10000000 + minor*100000 + patch*1000 + stage*100 + n`, where the stage
ranks `alpha=1, beta=2, rc=3, final=9`:

| Tag | versionCode |
|---|---|
| `v1.0.0-alpha.1` | 10000101 |
| `v1.0.0-beta.1` | 10000201 |
| `v1.0.0-rc.1` | 10000301 |
| `v1.0.0` | 10000999 |
| `v1.0.1-beta.1` | 10001201 |

Android refuses to upgrade an installed app unless `versionCode` increases, and ranking
the stage is what stops `-beta.1` and `-rc.1` colliding. Deriving it from the tag rather
than the CI run number also means rebuilding a tag reproduces the same `versionCode`.

**This tag scheme (`v*`) is shared with any future React Native release pipeline.** If one
is added, it must use a different tag pattern, or the two workflows will both fire on the
same push.

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

**If the React Native app ever ships a signed release, it must be signed with this same
keystore.** Both apps declare the Android package `xyz.hub13.remindiary`; a different
signing key means Android refuses the upgrade in place, and every existing user would have
to uninstall — losing their journal — before installing the new one.

### Building a release locally

`make release` produces the same signed `.aab` that CI does, and is also what you would
upload to Google Play. It needs `zip` and
[`bundletool`](https://developer.android.com/tools/bundletool) on PATH:

```bash
make release KEYSTORE=~/keys/remindiary.keystore KEY_NAME=remindiary
```

Passwords are prompted for on stdin rather than passed as variables, so they stay out of
your shell history — `KEYSTORE_PASS`/`KEY_PASS` exist only for CI, which has no stdin to
prompt on. Do not set `ABI` for a release bundle: it should carry every ABI and let Play
(or the universal APK) cover any device.

## Licence

[GPL-3.0-or-later](../LICENSE). If you distribute a modified version, you must publish
your changes under the same licence.
