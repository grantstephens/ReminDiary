#!/usr/bin/env python3
"""Strip the debug keystore from android/app/build.gradle's release build type
and wire it to sign with the real release keystore via env vars instead.

expo prebuild's generated build.gradle signs "release" with the debug
keystore by default - its own comment says as much: "Caution! In production,
you need to generate your own keystore file." expo prebuild regenerates
android/ from scratch every run (Continuous Native Generation), so this has
to be re-applied after every prebuild rather than hand-edited once.

Anchored on the exact text of the current Expo template; asserts both
anchors are found exactly once, so a future template change fails loudly
instead of quietly shipping a debug-signed "release" APK.

Reads RELEASE_STORE_FILE/RELEASE_STORE_PASSWORD/RELEASE_KEY_ALIAS/
RELEASE_KEY_PASSWORD from the environment at build time (not at patch time -
the generated build.gradle reads them via System.getenv() itself).
"""

path = "android/app/build.gradle"
with open(path) as f:
    content = f.read()

debug_block = """    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }"""
assert content.count(debug_block) == 1, (
    "signingConfigs.debug block not found verbatim - "
    "Expo's generated build.gradle template may have changed"
)
release_block = (
    debug_block[: -len("\n    }")]
    + """
        release {
            storeFile file(System.getenv("RELEASE_STORE_FILE"))
            storePassword System.getenv("RELEASE_STORE_PASSWORD")
            keyAlias System.getenv("RELEASE_KEY_ALIAS")
            keyPassword System.getenv("RELEASE_KEY_PASSWORD")
        }
    }"""
)
content = content.replace(debug_block, release_block, 1)

release_signing_line = """            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug"""
assert content.count(release_signing_line) == 1, (
    "release buildType's signingConfig line not found verbatim - "
    "Expo's generated build.gradle template may have changed"
)
content = content.replace(
    release_signing_line,
    release_signing_line.replace(
        "signingConfig signingConfigs.debug",
        "signingConfig signingConfigs.release",
    ),
    1,
)

with open(path, "w") as f:
    f.write(content)
print("Patched release signingConfig into build.gradle")
