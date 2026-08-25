#!/usr/bin/env bash
# Derives versionName/versionCode from a release tag (e.g. "v1.0.0-beta.6").
#
# versionCode is packed as major*10000000 + minor*100000 + patch*1000 +
# stage*100 + n, because Android requires it to strictly increase between
# installs and a plain per-release counter would not survive a repo move or
# a skipped tag - with stage ranked alpha=1, beta=2, rc=3, final=9 (and
# n=99 for final), so 1.0.0-alpha.1 < -beta.1 < -beta.2 < -rc.1 < 1.0.0 <
# 1.0.1-beta.1. Deriving it from the tag rather than a run number keeps it
# reproducible: rebuilding a tag yields the same versionCode.
#
# This is the single source of truth for that arithmetic - shared between
# release.yml (the real GitHub Release / Obtainium build) and
# `make prepare-release` (which commits the result into fdroid-version.txt
# before tagging, so F-Droid's checkupdates can read it without needing
# arithmetic of its own).
#
# Usage: compute-version.sh v1.0.0-beta.6
# Output (stdout): versionName=1.0.0-beta.6\nversionCode=10000206

set -euo pipefail

TAG="${1:?usage: compute-version.sh <tag>}"
VERSION="${TAG#v}"
CORE="${VERSION%%-*}"
SUFFIX="${VERSION#"$CORE"}"
IFS=. read -r MAJOR MINOR PATCH <<EOF
$CORE
EOF
MAJOR=${MAJOR:-0}; MINOR=${MINOR:-0}; PATCH=${PATCH:-0}
NUM=$(printf '%s' "$SUFFIX" | grep -oE '[0-9]+$' || true)
NUM=${NUM:-0}
case "$SUFFIX" in
  '')       STAGE=9; NUM=99 ;;
  -alpha*)  STAGE=1 ;;
  -beta*)   STAGE=2 ;;
  -rc*)     STAGE=3 ;;
  *) echo "::error::unrecognised pre-release suffix '$SUFFIX' in $TAG (expected -alpha/-beta/-rc)" >&2; exit 1 ;;
esac
PRE=$((STAGE * 100 + NUM))
for n in "$MAJOR" "$MINOR" "$PATCH" "$NUM"; do
  case "$n" in *[!0-9]*|'') echo "::error::bad version component in $TAG" >&2; exit 1;; esac
done
[ "$MINOR" -le 99 ] && [ "$PATCH" -le 99 ] && [ "$NUM" -le 99 ] || {
  echo "::error::version component out of range for versionCode packing: $TAG" >&2; exit 1; }
CODE=$((MAJOR * 10000000 + MINOR * 100000 + PATCH * 1000 + PRE))

echo "versionName=$VERSION"
echo "versionCode=$CODE"
