#!/usr/bin/env bash
# Verifies a signed release APK before it ships: real signing key, minimum
# targetSdk, the single expected permission, the expected versionCode, and
# (optionally) an exact native-code ABI set. Assertions, not just output - a
# silent regression here ships a broken, over-permissioned, or wrongly-signed
# build to everyone running Obtainium or installing from F-Droid's reference.
#
# Usage: verify-release-apk.sh <apk> <expected-versioncode> [expected-native-code]
#
# expected-native-code, if given, must match aapt's native-code line exactly,
# e.g. "'armeabi-v7a'" for a single-ABI split APK. Omit it for the universal
# APK, which legitimately carries all four ABIs and isn't worth pinning here.
#
# Expects RUNNER_TEMP, KS_PASS, and KEY_ALIAS in the environment (the keystore
# path and the real signing credentials), matching release.yml's own env.
set -euo pipefail

APK="$1"
EXPECTED_CODE="$2"
EXPECTED_NATIVE_CODE="${3:-}"

apksigner verify --print-certs "$APK"

TARGET=$(aapt dump badging "$APK" | sed -n "s/.*targetSdkVersion:'\([0-9]*\)'.*/\1/p")
echo "targetSdkVersion=$TARGET"
[ "$TARGET" -ge 35 ] || { echo "::error::targetSdkVersion $TARGET < 35"; exit 1; }

# DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION is excluded deliberately: it is a
# self-signature permission AndroidX Core auto-injects to emulate Android
# 13's RECEIVER_NOT_EXPORTED flag on older API levels
# (ContextCompat.registerReceiver()) - scoped to this app's own package,
# unusable by any other app, invisible in Play Store's permission listing.
#
# INTERNET is the one permission this app is allowed to declare - it backs
# the opt-in, off-by-default Umami analytics toggle in Settings (see
# src/platform/analytics.*.ts). Checked by name, not just count, so a future
# dependency swapping in some other permission while still totalling one
# would not slip through.
PERM_LIST=$(aapt dump permissions "$APK" | grep 'uses-permission' \
  | grep -v 'DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION' \
  | sed -n "s/.*name='\([^']*\)'.*/\1/p" | sort)
echo "declared permissions:"
echo "$PERM_LIST"
[ "$PERM_LIST" = "android.permission.INTERNET" ] || {
  echo "::error::declared permissions were [$PERM_LIST], expected only android.permission.INTERNET"
  exit 1; }

CODE=$(aapt dump badging "$APK" | sed -n "s/.*versionCode='\([0-9]*\)'.*/\1/p")
[ "$CODE" = "$EXPECTED_CODE" ] || {
  echo "::error::versionCode $CODE != $EXPECTED_CODE"; exit 1; }

# Confirms the signing-config patch actually took effect: the APK's
# certificate fingerprint must match the real release keystore's, not the
# debug one build.gradle defaults to.
APK_FPR=$(apksigner verify --print-certs "$APK" \
  | sed -n 's/.*SHA-256 digest: //p' | head -1 | tr 'A-F' 'a-f')
KS_FPR=$(keytool -list -v -keystore "$RUNNER_TEMP/keystore.jks" \
  -storepass "$KS_PASS" -alias "$KEY_ALIAS" \
  | sed -n 's/.*SHA256: *//p' | head -1 | tr -d ':' | tr 'A-F' 'a-f')
[ -n "$APK_FPR" ] && [ "$APK_FPR" = "$KS_FPR" ] || {
  echo "::error::APK is not signed with the release keystore (signing patch did not apply)"
  echo "apksigner: $APK_FPR"
  echo "keystore:  $KS_FPR"
  exit 1; }

NATIVE_CODE=$(aapt dump badging "$APK" | sed -n "s/^native-code: //p")
echo "native-code: $NATIVE_CODE"
if [ -n "$EXPECTED_NATIVE_CODE" ]; then
  [ "$NATIVE_CODE" = "$EXPECTED_NATIVE_CODE" ] || {
    echo "::error::native-code was [$NATIVE_CODE], expected [$EXPECTED_NATIVE_CODE]"
    exit 1; }
fi

aapt dump badging "$APK" | grep -E '^package|native-code'
